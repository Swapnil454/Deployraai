package core

import (
	"fmt"
	"go/ast"
	"go/build"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// AuditAST inspects an AST File node and reports policy violations.
func auditASTNode(fset *token.FileSet, filename string, node *ast.File) []string {
	var violations []string

	for _, decl := range node.Decls {
		gen, ok := decl.(*ast.GenDecl)
		if !ok || gen.Tok != token.VAR {
			continue
		}
		// Structural Rule 1: No package-level var of func type in production code
		for _, spec := range gen.Specs {
			vspec, ok := spec.(*ast.ValueSpec)
			if !ok {
				continue
			}
			// Check if declared type is a function
			if _, isFunc := vspec.Type.(*ast.FuncType); isFunc {
				for _, name := range vspec.Names {
					violations = append(violations, fmt.Sprintf("%s:%d: package-level var %s of func type is forbidden",
						filename, fset.Position(name.Pos()).Line, name.Name))
				}
			}
			// Check if assigned value is a function literal
			for i, val := range vspec.Values {
				if _, isFuncLit := val.(*ast.FuncLit); isFuncLit {
					name := "anon"
					if i < len(vspec.Names) {
						name = vspec.Names[i].Name
					}
					violations = append(violations, fmt.Sprintf("%s:%d: package-level var %s assigned func literal is forbidden",
						filename, fset.Position(val.Pos()).Line, name))
				}
				// Structural Rule 1b: Ban package-level vars initialized from netsec function values (e.g. var blk = netsec.IsBlocked)
				if sel, isSel := val.(*ast.SelectorExpr); isSel {
					if pkgIdent, ok := sel.X.(*ast.Ident); ok && pkgIdent.Name == "netsec" {
						name := "anon"
						if i < len(vspec.Names) {
							name = vspec.Names[i].Name
						}
						violations = append(violations, fmt.Sprintf("%s:%d: package-level var %s initialized from netsec.%s is forbidden",
							filename, fset.Position(val.Pos()).Line, name, sel.Sel.Name))
					}
				}
			}
		}
	}

	ast.Inspect(node, func(n ast.Node) bool {
		// Structural Rule 2: No BlockedIPFunc field assignments outside _test.go
		if kve, ok := n.(*ast.KeyValueExpr); ok {
			if keyIdent, ok := kve.Key.(*ast.Ident); ok && keyIdent.Name == "BlockedIPFunc" {
				violations = append(violations, fmt.Sprintf("%s:%d: forbidden BlockedIPFunc assignment in production code",
					filename, fset.Position(kve.Pos()).Line))
			}
		}

		// Deprecated Identifiers
		if ident, ok := n.(*ast.Ident); ok {
			if ident.Name == "WithBlockedIPFunc" || ident.Name == "isBlockedIPFunc" || ident.Name == "DisableSSRFBlocker" {
				violations = append(violations, fmt.Sprintf("%s:%d: forbidden deprecated identifier: %s",
					filename, fset.Position(ident.Pos()).Line, ident.Name))
			}
		}

		return true
	})

	return violations
}

// Invariant Test: Ensures production codebase has 0 violations.
func TestPolicyAudit_ASTInvariant(t *testing.T) {
	root := ".."
	fset := token.NewFileSet()

	var nonTestFiles []string
	err := filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if info.IsDir() {
			if strings.HasPrefix(info.Name(), ".") || info.Name() == "vendor" {
				return filepath.SkipDir
			}
			return nil
		}
		if strings.HasSuffix(path, ".go") && !strings.HasSuffix(path, "_test.go") {
			match, err := build.Default.MatchFile(filepath.Dir(path), info.Name())
			if err == nil && !match {
				return nil // Skip files with build tags not matching default build (e.g. killhook)
			}
			nonTestFiles = append(nonTestFiles, path)
		}
		return nil
	})
	if err != nil {
		t.Fatalf("failed to walk source tree: %v", err)
	}

	totalViolations := 0
	for _, file := range nonTestFiles {
		src, err := os.ReadFile(file)
		if err != nil {
			t.Fatalf("failed to read %s: %v", file, err)
		}
		node, err := parser.ParseFile(fset, file, src, parser.ParseComments)
		if err != nil {
			t.Fatalf("failed to parse %s: %v", file, err)
		}
		v := auditASTNode(fset, file, node)
		for _, msg := range v {
			t.Errorf("AST policy violation: %s", msg)
			totalViolations++
		}
	}
	if totalViolations != 0 {
		t.Fatalf("Production code contains %d AST policy violations", totalViolations)
	}
}

// Negative Control: Verifies that AST auditor catches violations.
func TestPolicyAudit_NegativeControl(t *testing.T) {
	fset := token.NewFileSet()

	badCode := `package core
import "net/netip"

// Violation 1: Package-level var of func type
var evilHook func(netip.Addr) bool

// Violation 2: Package-level var assigned func literal
var badCallback = func() bool { return false }

// Violation 3: Deprecated identifier
func triggerDeprecated() {
	_ = isBlockedIPFunc
}

// Violation 4: BlockedIPFunc field assignment in struct literal
type dummyCfg struct { BlockedIPFunc func() }
func triggerAssignment() {
	_ = dummyCfg{
		BlockedIPFunc: nil,
	}
}

// Violation 5: Package-level var initialized from netsec function value
var blk = netsec.IsBlocked
`

	node, err := parser.ParseFile(fset, "bad_mock.go", badCode, parser.ParseComments)
	if err != nil {
		t.Fatalf("failed to parse mock code: %v", err)
	}

	violations := auditASTNode(fset, "bad_mock.go", node)
	if len(violations) < 5 {
		t.Fatalf("expected at least 5 violations caught by negative control, got %d: %v", len(violations), violations)
	}

	t.Logf("Negative control successfully caught %d deliberate violations:", len(violations))
	for _, v := range violations {
		t.Logf("  [EXPECTED VIOLATION] %s", v)
	}
}
