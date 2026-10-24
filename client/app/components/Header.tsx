"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

export default function Header() {
  const [user, setUser] = useState<any>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || ""}/api/auth/me`,
          { credentials: "include" }
        );
        if (response.ok) {
          const userData = await response.json();
          setUser(userData);
        }
      } catch (error) {
        // Silently fail if not logged in
      }
    };
    fetchUser();
  }, []);

  const handleLogout = async () => {
    try {
      await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || ""}/api/auth/logout`,
        {
          method: "POST",
          credentials: "include",
        }
      );
      setUser(null);
      window.location.href = "/";
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  // Hide header on dashboard and dedicated standalone pages
  if (
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/status-page") ||
    pathname.startsWith("/admin")
  ) {
    return null;
  }

  const navLinks = [
    { label: "Product", href: "#features" },
    { label: "Developers", href: "/docs" },
    { label: "Resources", href: "/docs" },
    { label: "Pricing", href: "#pricing" },
    { label: "Company", href: "#about" },
  ];

  return (
    <header className="sticky top-0 z-50 w-full flex flex-col font-sans select-none bg-[#111111]">
      {/* ── Top Announcement Banner (Slightly greenish dark tint matching corner glow) ─── */}
      <div className="w-full bg-[#011910] py-2 sm:py-2.5 px-4 text-center text-[13px] text-white/95 tracking-normal">
        <span>Migrating production infrastructure? Get up to $10K in migration credits. </span>
        <Link
          href="/login"
          className="underline hover:text-white transition-colors ml-1 font-normal underline-offset-2"
        >
          Apply now
        </Link>
      </div>

      {/* ── Main Navigation Bar (Slightly grey subtle off-black with no top border) ── */}
      <nav className="w-full h-[68px] bg-[#111111] border-b border-zinc-800/70 flex items-center justify-between pl-6 sm:pl-8 pr-0">
        {/* Left Section: Logo + Navigation Links */}
        <div className="flex items-center gap-8 lg:gap-11 h-full">
          {/* Deployra Brand Logo */}
          <Link
            href="/"
            className="flex items-center py-2 transition-opacity hover:opacity-90 flex-shrink-0"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://res.cloudinary.com/djhuduvrr/image/upload/v1787775599/deployraai_logo_lgkg7l.png"
              alt="Deployra"
              className="h-8.5 sm:h-9 md:h-9.5 w-auto object-contain brightness-105"
            />
          </Link>

          {/* Desktop Nav Links */}
          <div className="hidden md:flex items-center gap-7 lg:gap-9 text-[15.5px] text-zinc-300 font-normal">
            {navLinks.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="hover:text-white transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>

        {/* Right Section: Migrate link & Full-Height White Block CTA */}
        <div className="flex items-center h-full">
          <div className="hidden md:flex items-center gap-6 lg:gap-8 text-[15.5px] mr-6 lg:mr-8">
            <Link
              href="/"
              className="text-zinc-300 hover:text-white font-normal transition-colors whitespace-nowrap"
            >
              Migrate to Deployra
            </Link>
          </div>

          {/* White Full-Height Block CTA Button touching the right edge */}
          {user ? (
            <Link
              href="/dashboard"
              className="h-full bg-white text-black font-normal text-[15.5px] px-6 lg:px-8 flex items-center justify-center transition-colors hover:bg-zinc-100 active:bg-zinc-200 whitespace-nowrap border-l border-zinc-200/20"
            >
              Dashboard
            </Link>
          ) : (
            <Link
              href="/login"
              className="h-full bg-white text-black font-normal text-[15.5px] px-8 lg:px-10 flex items-center justify-center transition-colors hover:bg-zinc-100 active:bg-zinc-200 whitespace-nowrap border-l border-zinc-200/20"
            >
              Get started
            </Link>
          )}

          {/* Mobile Menu Hamburger */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden text-zinc-400 hover:text-white p-2 mr-4 ml-1"
            aria-label="Toggle Navigation"
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </nav>

      {/* ── Mobile Navigation Dropdown ────────────────────────────── */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-zinc-950 border-b border-zinc-800 px-6 py-5 flex flex-col gap-4 text-sm text-zinc-300 animate-in slide-in-from-top-2 duration-200">
          {navLinks.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              onClick={() => setMobileMenuOpen(false)}
              className="hover:text-white transition-colors py-1 text-base font-normal"
            >
              {link.label}
            </Link>
          ))}
          <div className="border-t border-zinc-800 pt-4 flex flex-col gap-3">
            <Link
              href="/"
              onClick={() => setMobileMenuOpen(false)}
              className="hover:text-white transition-colors py-1 text-base"
            >
              Migrate to Deployra
            </Link>
            {user ? (
              <>
                <Link
                  href="/dashboard"
                  onClick={() => setMobileMenuOpen(false)}
                  className="hover:text-white transition-colors py-1 text-base"
                >
                  Dashboard
                </Link>
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    handleLogout();
                  }}
                  className="text-left text-zinc-400 hover:text-white py-1 text-base"
                >
                  Sign out
                </button>
              </>
            ) : (
              <Link
                href="/login"
                onClick={() => setMobileMenuOpen(false)}
                className="hover:text-white transition-colors py-1 text-base"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
