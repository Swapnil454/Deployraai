import axios from "axios";
import User from "../models/User.js";
import { decryptSecret } from "../utils/encryption.js";

const getGithubToken = async (userId) => {
  const user = await User.findById(userId);
  if (!user || !user.githubConnected || !user.githubAccessTokenEncrypted) {
    throw new Error("GitHub account not connected or token missing");
  }
  return decryptSecret(user.githubAccessTokenEncrypted);
};

export const analyzeProject = async (req, res) => {
  try {
    const { owner, repo, branch } = req.body;
    if (!owner || !repo || !branch) {
      return res.status(400).json({ error: "Owner, repo, and branch are required" });
    }

    const token = await getGithubToken(req.user.userId);
    
    // 1. Fetch recursive tree
    const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
    const treeResponse = await axios.get(treeUrl, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const tree = treeResponse.data.tree;

    // Detect common files
    const packageJsonNode = tree.find(node => node.path === "package.json");
    const clientPackageJsonNode = tree.find(node => node.path.match(/^(client|frontend|web|app)\/package\.json$/));
    const serverPackageJsonNode = tree.find(node => node.path.match(/^(server|backend|api)\/package\.json$/));
    
    // Helper to fetch file content
    const fetchPackageJsonContent = async (path) => {
      if (!path) return null;
      try {
        const contentUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
        const contentRes = await axios.get(contentUrl, {
           headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.v3+json" }
        });
        const decoded = Buffer.from(contentRes.data.content, "base64").toString("utf-8");
        return JSON.parse(decoded);
      } catch (err) {
        console.error(`Failed to parse ${path}`);
        return null;
      }
    };

    const rootPackage = await fetchPackageJsonContent(packageJsonNode?.path);
    const clientPackage = await fetchPackageJsonContent(clientPackageJsonNode?.path);
    const serverPackage = await fetchPackageJsonContent(serverPackageJsonNode?.path);
    
    // Detect Monorepo
    const isMonorepo = !!(clientPackageJsonNode && serverPackageJsonNode);

    // Analysis structure matches the schema exactly
    const analysis = {
      isMonorepo,
      frontend: { detected: false, framework: null, path: null, packageManager: "npm", buildCommand: null, startCommand: null },
      backend: { detected: false, framework: null, path: null, packageManager: "npm", startCommand: null },
      database: { detected: false, type: null, orm: null },
      warnings: []
    };

    // Helper to scan a package json
    const analyzePackage = (pkg, pathPrefix) => {
      if (!pkg) return;
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      
      // Frontend checks
      if (deps.next) {
        analysis.frontend.detected = true;
        analysis.frontend.framework = "Next.js";
        analysis.frontend.path = pathPrefix || "/";
        analysis.frontend.buildCommand = pkg.scripts?.build || "npm run build";
        analysis.frontend.startCommand = pkg.scripts?.start || "npm start";
      } else if (deps.vite) {
        analysis.frontend.detected = true;
        analysis.frontend.framework = "React Vite";
        analysis.frontend.path = pathPrefix || "/";
        analysis.frontend.buildCommand = pkg.scripts?.build || "npm run build";
        analysis.frontend.startCommand = pkg.scripts?.preview || "npm run preview";
      } else if (deps.react) {
        analysis.frontend.detected = true;
        analysis.frontend.framework = "React CRA";
        analysis.frontend.path = pathPrefix || "/";
      }

      // Backend checks
      if (deps.express) {
        analysis.backend.detected = true;
        analysis.backend.framework = "Express";
        analysis.backend.path = pathPrefix || "/";
        analysis.backend.startCommand = pkg.scripts?.start || "npm start";
      } else if (deps.fastify) {
        analysis.backend.detected = true;
        analysis.backend.framework = "Fastify";
        analysis.backend.path = pathPrefix || "/";
      } else if (deps.nestjs || deps['@nestjs/core']) {
        analysis.backend.detected = true;
        analysis.backend.framework = "NestJS";
        analysis.backend.path = pathPrefix || "/";
      }

      // DB checks
      if (deps.mongoose || deps.mongodb) {
        analysis.database.detected = true;
        analysis.database.type = "MongoDB";
        analysis.database.orm = deps.mongoose ? "Mongoose" : "MongoDB Native";
      } else if (deps['@prisma/client']) {
        analysis.database.detected = true;
        analysis.database.type = "Database (Prisma)";
        analysis.database.orm = "Prisma";
      } else if (deps.pg) {
        analysis.database.detected = true;
        analysis.database.type = "PostgreSQL";
      } else if (deps.mysql2) {
        analysis.database.detected = true;
        analysis.database.type = "MySQL";
      }
    };

    if (isMonorepo) {
      analyzePackage(clientPackage, clientPackageJsonNode.path.split('/')[0]);
      analyzePackage(serverPackage, serverPackageJsonNode.path.split('/')[0]);
    } else {
      analyzePackage(rootPackage, "/");
    }

    const hasDocker = tree.some(n => n.path === "Dockerfile" || n.path.includes("/Dockerfile"));
    const hasVercel = tree.some(n => n.path === "vercel.json");
    const hasRender = tree.some(n => n.path === "render.yaml");

    if (!hasDocker) analysis.warnings.push("No Dockerfile found");
    if (!hasRender && !hasVercel) analysis.warnings.push("No deployment configuration (render.yaml or vercel.json) found");

    res.json({ success: true, analysis });
  } catch (error) {
    console.error("Project Analysis Error:", error.response?.data || error.message);
    if (error.response?.status === 401 || error.message.includes("token missing")) {
      return res.status(401).json({ error: "GitHub connection expired. Please reconnect GitHub." });
    }
    res.status(500).json({ error: "Failed to analyze project" });
  }
};

import Project from "../models/Project.js";
import { encryptSecret } from "../utils/encryption.js";

export const createProject = async (req, res) => {
  try {
    const { owner, repo, branch, analysis, fullName, htmlUrl, defaultBranch } = req.body;
    
    if (!owner || !repo || !branch || !analysis) {
      return res.status(400).json({ error: "Missing required project fields" });
    }

    const project = await Project.create({
      userId: req.user.userId,
      repoOwner: owner,
      repoName: repo,
      repoFullName: fullName || `${owner}/${repo}`,
      selectedBranch: branch,
      defaultBranch: defaultBranch || branch,
      repoUrl: htmlUrl,
      analysis,
      status: 'analyzed'
    });

    res.status(201).json({ projectId: project._id });
  } catch (error) {
    console.error("Create Project Error:", error.message);
    res.status(500).json({ error: "Failed to create project" });
  }
};

export const getProjects = async (req, res) => {
  try {
    const { search, sortBy, filterBy } = req.query;
    let query = { userId: req.user.userId };
    
    if (search) {
      query.repoName = { $regex: search, $options: 'i' };
    }
    
    if (filterBy === 'Microfrontend') {
      query['analysis.isMonorepo'] = true;
    } else if (filterBy === 'Repository') {
      query['analysis.isMonorepo'] = false;
    }

    let sort = { updatedAt: -1, createdAt: -1 };
    if (sortBy === 'Name') {
      sort = { repoName: 1 };
    }

    const projects = await Project.find(query).sort(sort);
    res.json(projects);
  } catch (error) {
    console.error("Get Projects Error:", error.message);
    res.status(500).json({ error: "Failed to fetch projects" });
  }
};

export const getProject = async (req, res) => {
  try {
    const project = await Project.findOne({ _id: req.params.id, userId: req.user.userId }).lean();
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    // Decrypt values for the frontend as per user request
    if (project.configuration?.envVariables) {
      const safeEnv = (envs) => envs?.map(env => ({
        key: env.key,
        hasValue: !!env.valueEncrypted,
        value: env.valueEncrypted ? decryptSecret(env.valueEncrypted) : "",
        isSecret: env.isSecret
      })) || [];

      project.configuration.envVariables = {
        frontend: safeEnv(project.configuration.envVariables.frontend),
        backend: safeEnv(project.configuration.envVariables.backend),
        shared: safeEnv(project.configuration.envVariables.shared)
      };
    }

    res.json(project);
  } catch (error) {
    console.error("Get Project Error:", error.message);
    res.status(500).json({ error: "Failed to fetch project" });
  }
};

export const updateProjectConfig = async (req, res) => {
  try {
    const { configuration } = req.body;
    if (!configuration) {
      return res.status(400).json({ error: "Configuration object is required" });
    }

    const project = await Project.findOne({ _id: req.params.id, userId: req.user.userId });
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    // Encrypt env variables
    const processEnvs = (envs, existingEnvs) => {
      if (!envs) return [];
      return envs.map(env => {
        let valEncrypted = undefined;
        if (env.value) {
          valEncrypted = encryptSecret(env.value);
        } else {
          const existing = existingEnvs?.find(e => e.key === env.key);
          if (existing) {
            valEncrypted = existing.valueEncrypted;
          }
        }
        return {
          key: env.key,
          isSecret: env.isSecret ?? true,
          valueEncrypted: valEncrypted
        };
      }).filter(e => e.valueEncrypted !== undefined);
    };

    if (configuration.envVariables) {
      configuration.envVariables = {
        frontend: processEnvs(configuration.envVariables.frontend, project.configuration?.envVariables?.frontend),
        backend: processEnvs(configuration.envVariables.backend, project.configuration?.envVariables?.backend),
        shared: processEnvs(configuration.envVariables.shared, project.configuration?.envVariables?.shared)
      };
    }

    project.configuration = configuration;
    project.status = 'configured';
    
    await project.save();

    res.json({ success: true, message: "Configuration saved successfully" });
  } catch (error) {
    console.error("Update Config Error:", error.message);
    res.status(500).json({ error: "Failed to save configuration" });
  }
};
