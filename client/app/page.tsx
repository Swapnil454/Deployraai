import { ArrowRight, Terminal, Zap, Shield, Rocket } from "lucide-react";
import Link from "next/link";

export default function Home() {
  return (
    <main className="flex-1 flex flex-col items-center w-full">
      {/* Hero Section */}
      <section className="relative w-full overflow-hidden bg-black pt-24 pb-32 sm:pt-32 sm:pb-40">
        {/* Background Grid */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-[size:14px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]"></div>
        
        {/* Glow Effects */}
        <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-indigo-500/30 blur-[120px] rounded-full pointer-events-none"></div>

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center flex flex-col items-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-4 py-1.5 text-sm font-medium text-indigo-300 mb-8 shadow-[0_0_20px_rgba(99,102,241,0.15)]">
            <span className="flex h-2 w-2 rounded-full bg-indigo-500 animate-pulse"></span>
            Deployments on Autopilot
          </div>
          
          <h1 className="max-w-4xl text-5xl font-extrabold tracking-tight text-white sm:text-7xl mb-6">
            Ship faster with an <br/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-cyan-400 animate-gradient-x">
              AI Deployment Agent
            </span>
          </h1>
          
          <p className="max-w-2xl text-lg text-zinc-400 sm:text-xl mb-10 leading-relaxed">
            Stop managing infrastructure. Our AI agent connects to your repository, understands your codebase, and automates your entire deployment pipeline with zero configuration.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
            <Link 
              href="/login" 
              className="group flex w-full sm:w-auto items-center justify-center gap-2 rounded-full bg-white px-8 py-4 text-base font-semibold text-black transition-all hover:bg-zinc-200 hover:scale-105 active:scale-95 shadow-[0_0_30px_rgba(255,255,255,0.2)]"
            >
              Get Started for Free
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
            </Link>
            <Link 
              href="/docs" 
              className="group flex w-full sm:w-auto items-center justify-center gap-2 rounded-full border border-zinc-700 bg-zinc-900/50 px-8 py-4 text-base font-medium text-white transition-all hover:bg-zinc-800 hover:border-zinc-500"
            >
              <Terminal className="h-5 w-5 text-zinc-400 group-hover:text-white transition-colors" />
              View Documentation
            </Link>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="w-full bg-black py-24 sm:py-32 relative z-10 border-t border-zinc-900/50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Everything you need to deploy at scale
            </h2>
            <p className="mt-4 text-lg text-zinc-400">
              Our AI handles the complexity so you can focus on writing code.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                icon: Zap,
                title: "Zero Config Deployments",
                desc: "The agent automatically detects your framework, provisions resources, and sets up CI/CD pipelines without human intervention."
              },
              {
                icon: Shield,
                title: "Auto-Healing Infrastructure",
                desc: "If a deployment fails, the agent instantly diagnoses the error, suggests a fix, and rolls back to a stable version."
              },
              {
                icon: Rocket,
                title: "Global Edge Network",
                desc: "Your application is instantly deployed to over 300 edge locations worldwide, ensuring the lowest possible latency for users."
              }
            ].map((feature, i) => (
              <div key={i} className="relative group rounded-2xl border border-zinc-800 bg-zinc-900/40 p-8 transition-all duration-300 hover:-translate-y-1 hover:border-indigo-500/50 hover:bg-zinc-800/80 hover:shadow-[0_0_30px_rgba(99,102,241,0.15)] overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="relative">
                  <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-800/80 mb-6 group-hover:bg-indigo-500/20 transition-colors duration-300 border border-zinc-700/50 group-hover:border-indigo-500/50">
                    <feature.icon className="h-6 w-6 text-zinc-400 group-hover:text-indigo-400 transition-colors duration-300" />
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-3 group-hover:text-indigo-50 transition-colors duration-300">{feature.title}</h3>
                  <p className="text-zinc-400 leading-relaxed group-hover:text-zinc-300 transition-colors duration-300">
                    {feature.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
