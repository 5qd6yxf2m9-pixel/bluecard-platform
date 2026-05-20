'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

function HeroShowcase() {
  const [state, setState] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setState((prev) => (prev + 1) % 3)
    }, 3000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="relative w-full max-w-[440px] mx-auto min-h-[300px] bg-white rounded-xl shadow-2xl border border-gray-100 p-6 flex flex-col justify-between text-[#0a1628] overflow-hidden">
      
      {/* State 1: BlueCardLogic */}
      <div className={`transition-all duration-500 flex flex-col justify-between h-full ${state === 0 ? 'opacity-100 translate-x-0 relative' : 'opacity-0 translate-x-4 absolute inset-0 p-6 pointer-events-none'}`}>
        <div>
          <div className="flex justify-between items-center mb-3">
            <span className="font-display font-bold text-base text-[#0a1628]">BlueCardLogic</span>
            <span className="inline-flex items-center space-x-1.5 text-[11px] font-semibold text-[#16a34a] bg-green-50 px-2 py-0.5 rounded-full ring-1 ring-inset ring-green-600/20">
              <span className="h-1.5 w-1.5 rounded-full bg-[#16a34a]"></span>
              <span>Live</span>
            </span>
          </div>
          <p className="text-xs text-gray-500 font-medium mb-5">PT-00482 · PPO · Blue Shield prefix AAB</p>
          <div className="space-y-3 mb-5">
            <div className="flex justify-between text-xs font-medium text-gray-600">
              <span>Anthem expected:</span>
              <span>$3,240</span>
            </div>
            <div className="flex justify-between text-xs font-semibold text-[#0a1628]">
              <span>Blue Shield expected:</span>
              <span>$4,890</span>
            </div>
          </div>
        </div>
        <div className="flex justify-between items-center pt-3 border-t border-gray-100 mt-auto">
          <span className="text-xs font-bold text-[#16a34a] bg-green-50 px-2.5 py-1 rounded-md">
            Route to Blue Shield +$1,650
          </span>
          <span className="text-[11px] font-semibold text-gray-500">Confidence: 94 — High</span>
        </div>
      </div>

      {/* State 2: DenialLogic */}
      <div className={`transition-all duration-500 flex flex-col justify-between h-full ${state === 1 ? 'opacity-100 translate-x-0 relative' : 'opacity-0 translate-x-4 absolute inset-0 p-6 pointer-events-none'}`}>
        <div>
          <div className="flex justify-between items-center mb-3">
            <span className="font-display font-bold text-base text-[#0a1628]">DenialLogic</span>
            <span className="inline-flex items-center space-x-1.5 text-[11px] font-semibold text-[#16a34a] bg-green-50 px-2 py-0.5 rounded-full ring-1 ring-inset ring-green-600/20">
              <span className="h-1.5 w-1.5 rounded-full bg-[#16a34a]"></span>
              <span>Live</span>
            </span>
          </div>
          <p className="text-xs text-gray-500 font-medium mb-5">Claim #TEST0089 · Cigna · CARC 197</p>
          <div className="space-y-3 mb-5">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-semibold text-gray-600">Category:</span>
              <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-xs font-semibold text-[#d97706] ring-1 ring-inset ring-amber-600/20">
                Authorization
              </span>
            </div>
            <div className="text-xs text-gray-600">
              <span className="font-semibold">Root cause:</span> Auth number missing or invalid
            </div>
          </div>
        </div>
        <div className="pt-3 border-t border-gray-100 mt-auto">
          <div className="text-xs font-semibold text-[#16a34a]">Action: Submit retro-auth request to payer</div>
        </div>
      </div>

      {/* State 3: UnderpaymentLogic */}
      <div className={`transition-all duration-500 flex flex-col justify-between h-full ${state === 2 ? 'opacity-100 translate-x-0 relative' : 'opacity-0 translate-x-4 absolute inset-0 p-6 pointer-events-none'}`}>
        <div>
          <div className="flex justify-between items-center mb-3">
            <span className="font-display font-bold text-base text-[#0a1628]">UnderpaymentLogic</span>
            <span className="inline-flex items-center space-x-1.5 text-[11px] font-semibold text-gray-500 bg-gray-50 px-2 py-0.5 rounded-full ring-1 ring-inset ring-gray-200">
              <span className="h-1.5 w-1.5 rounded-full bg-gray-400"></span>
              <span>Coming Soon</span>
            </span>
          </div>
          <p className="text-xs text-gray-500 font-medium mb-5">Claim #UP-00291 · Anthem · DRG 470</p>
          <div className="space-y-3 mb-5">
            <div className="flex justify-between text-xs text-gray-600">
              <span>Contracted rate: $18,400</span>
              <span>Paid: $14,200</span>
            </div>
            <div>
              <span className="inline-flex items-center rounded-md bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-inset ring-red-600/20">
                Underpaid by $4,200
              </span>
            </div>
          </div>
        </div>
        <div className="pt-3 border-t border-gray-100 mt-auto">
          <div className="text-xs font-semibold text-[#d97706]">Action: Flag for dispute</div>
        </div>
      </div>

    </div>
  )
}

function MiniBlueCardAnimation() {
  const [winner, setWinner] = useState<'anthem' | 'bs'>('anthem')
  useEffect(() => {
    const interval = setInterval(() => {
      setWinner(prev => prev === 'anthem' ? 'bs' : 'anthem')
    }, 2000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="border border-gray-100 rounded-lg p-3 bg-gray-50/50 space-y-2 text-xs">
      <div className="flex justify-between font-semibold text-[#0a1628]">
        <span>Prefix XYZ</span>
        <span>Billed: $5,000</span>
      </div>
      <div className="space-y-1">
        <div className={`p-1.5 rounded border text-[11px] flex justify-between transition-all duration-300 ${winner === 'anthem' ? 'border-[#2563eb] bg-blue-50/50 text-[#2563eb]' : 'border-gray-200 bg-white'}`}>
          <span>Anthem rate: $3,500</span>
          {winner === 'anthem' && <span className="font-bold">Route</span>}
        </div>
        <div className={`p-1.5 rounded border text-[11px] flex justify-between transition-all duration-300 ${winner === 'bs' ? 'border-[#2563eb] bg-blue-50/50 text-[#2563eb]' : 'border-gray-200 bg-white'}`}>
          <span>Blue Shield rate: $4,200</span>
          {winner === 'bs' && <span className="font-bold">Route</span>}
        </div>
      </div>
    </div>
  )
}

function MiniBarChart() {
  return (
    <div className="border border-gray-100 rounded-lg p-3 bg-gray-50/50 space-y-2">
      <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Top Denial Categories</div>
      <div className="space-y-1.5 pt-1">
        {[
          { label: 'Auth', val: 'w-[90%]', color: 'bg-[#2563eb]' },
          { label: 'Eligibility', val: 'w-[65%]', color: 'bg-[#d97706]' },
          { label: 'Med Necessity', val: 'w-[40%]', color: 'bg-gray-400' }
        ].map((bar, i) => (
          <div key={i} className="flex items-center text-[10px] text-gray-600">
            <span className="w-20 truncate font-medium text-left">{bar.label}</span>
            <div className="flex-1 bg-gray-200 h-2 rounded overflow-hidden ml-2">
              <div className={`${bar.val} ${bar.color} h-full`}></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function LandingClient() {
  return (
    <div className="min-h-screen bg-white text-[#0a1628] selection:bg-[#2563eb] selection:text-white font-sans overflow-x-hidden">
      
      {/* SECTION 1 — NAV */}
      <nav className="bg-[#0a1628] border-b border-white/10 py-4 fixed top-0 w-full z-50">
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex justify-between items-center">
          <div className="font-display font-extrabold text-xl tracking-tight text-white">
            RevenueLogic
          </div>
          <div className="hidden md:flex space-x-8 items-center text-sm font-semibold text-gray-300">
            <a href="#platform" className="hover:text-white transition-colors">Platform</a>
            <a href="#modules" className="hover:text-white transition-colors">Modules</a>
            <Link href="/contact" className="hover:text-white transition-colors">
              Contact
            </Link>
          </div>
          <div className="flex items-center space-x-6">
            <Link href="/login" className="text-white hover:text-gray-300 transition-colors text-sm font-semibold">
              Sign In
            </Link>
            <Link 
              href="/contact" 
              className="bg-[#2563eb] text-white hover:bg-blue-700 px-5 py-2 rounded-md font-semibold text-sm transition-all duration-300 inline-block"
            >
              Request Demo
            </Link>
          </div>
        </div>
      </nav>

      {/* SECTION 2 — HERO */}
      <section id="platform" className="bg-[#0a1628] text-white pt-32 pb-24 px-6 md:px-12">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          
          {/* Left Hero Column */}
          <div className="lg:col-span-7 text-left space-y-6">
            <div className="text-[#2563eb] text-xs font-bold uppercase tracking-widest">
              Revenue Cycle Intelligence Platform
            </div>
            <h1 className="font-display text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight leading-tight text-white">
              Stop leaving revenue on the table.
            </h1>
            <p className="text-gray-300 text-lg leading-relaxed max-w-xl font-normal">
              RevenueLogic automates the decisions your billing team makes manually — BlueCard routing, denial analysis, underpayment detection — so every claim earns what it should.
            </p>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 pt-4">
              <Link 
                href="/contact" 
                className="bg-[#2563eb] text-white hover:bg-blue-700 px-8 py-4 rounded-md font-bold text-center transition-all duration-300"
              >
                Request a Demo
              </Link>
              <a 
                href="#how-it-works" 
                className="bg-transparent border border-white/20 hover:bg-white/5 text-white px-8 py-4 rounded-md font-bold text-center transition-all duration-300"
              >
                See How It Works
              </a>
            </div>
            
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400 font-semibold pt-4">
              <span>Flat monthly SaaS fee</span>
              <span className="text-gray-600">•</span>
              <span>No percentage of recovery</span>
              <span className="text-gray-600">•</span>
              <span>Works alongside Epic and your existing systems</span>
            </div>
          </div>

          {/* Right Hero Column */}
          <div className="lg:col-span-5 flex justify-center items-center">
            <HeroShowcase />
          </div>

        </div>
      </section>

      {/* SECTION 3 — PROBLEM STATEMENT */}
      <section className="bg-white py-24 px-6 md:px-12 text-center border-b border-gray-100">
        <div className="max-w-7xl mx-auto space-y-16">
          <h2 className="font-display text-3xl md:text-4xl font-extrabold text-[#0a1628] tracking-tight">
            Revenue cycle teams are drowning in manual work.
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="space-y-3 p-6">
              <div className="text-5xl font-extrabold font-display text-[#2563eb]">11.8%</div>
              <p className="text-gray-600 text-sm font-medium leading-relaxed">
                Claim denial rate — up from 10.2% just three years ago and still climbing
              </p>
            </div>
            <div className="space-y-3 p-6">
              <div className="text-5xl font-extrabold font-display text-[#2563eb]">$19B+</div>
              <p className="text-gray-600 text-sm font-medium leading-relaxed">
                Spent annually by US hospitals fighting denied claims
              </p>
            </div>
            <div className="space-y-3 p-6">
              <div className="text-5xl font-extrabold font-display text-[#2563eb]">32%</div>
              <p className="text-gray-600 text-sm font-medium leading-relaxed">
                Of medical claims are underpaid, costing hospitals billions in uncollected reimbursement
              </p>
            </div>
          </div>

          <div className="bg-[#eff6ff] rounded-2xl p-8 max-w-4xl mx-auto text-left border border-blue-100">
            <p className="text-[#0a1628] text-base leading-relaxed font-semibold">
              Your team is doing manually what software should do. BlueCard routing decisions, denial root cause analysis, underpayment variance detection — these are pattern recognition problems. RevenueLogic solves them at scale.
            </p>
          </div>
        </div>
      </section>

      {/* SECTION 4 — MODULES */}
      <section id="modules" className="bg-[#0a1628] text-white py-24 px-6 md:px-12">
        <div className="max-w-7xl mx-auto space-y-16">
          
          <div className="text-center space-y-4">
            <h2 className="font-display text-3xl md:text-4xl font-extrabold tracking-tight">
              One platform. Every revenue opportunity.
            </h2>
            <p className="text-gray-400 max-w-2xl mx-auto text-sm md:text-base">
              Six intelligent modules covering the full revenue cycle — use what you need, add more as you grow.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            {/* Card 1 - BlueCardLogic */}
            <div className="bg-white rounded-xl border-l-[6px] border-l-[#2563eb] p-6 flex flex-col justify-between text-[#0a1628] shadow-lg">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="font-display font-extrabold text-xl">BlueCardLogic</h3>
                  <span className="inline-flex items-center rounded-md bg-green-50 px-2 py-1 text-xs font-semibold text-[#16a34a] ring-1 ring-inset ring-green-600/20">
                    Live
                  </span>
                </div>
                <p className="text-gray-600 text-sm leading-relaxed">
                  Before billing a BlueCard member, RevenueLogic determines whether Anthem or Blue Shield pays more for that specific claim. Automatically. On every claim.
                </p>
                <div className="text-xs text-gray-500 font-medium">
                  <span className="font-bold text-[#0a1628]">Key features:</span> Alpha prefix validation, DOS verification, Reimbursement comparison, Confidence scoring, Manual review queue
                </div>
              </div>
              <div className="mt-6 pt-6 border-t border-gray-100">
                <MiniBlueCardAnimation />
              </div>
            </div>

            {/* Card 2 - DenialLogic */}
            <div className="bg-white rounded-xl border-l-[6px] border-l-[#d97706] p-6 flex flex-col justify-between text-[#0a1628] shadow-lg">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="font-display font-extrabold text-xl">DenialLogic</h3>
                  <span className="inline-flex items-center rounded-md bg-green-50 px-2 py-1 text-xs font-semibold text-[#16a34a] ring-1 ring-inset ring-green-600/20">
                    Live
                  </span>
                </div>
                <p className="text-gray-600 text-sm leading-relaxed">
                  Upload your 835 ERA denial files. RevenueLogic categorizes every denial by root cause, identifies payer patterns, and gives your billing team a clear action plan for each claim.
                </p>
                <div className="text-xs text-gray-500 font-medium">
                  <span className="font-bold text-[#0a1628]">Key features:</span> CARC/RARC analysis, XR rules engine, Payer trend detection, Work queue with appeal workflow, Recoverable opportunity tracking
                </div>
              </div>
              <div className="mt-6 pt-6 border-t border-gray-100">
                <MiniBarChart />
              </div>
            </div>

            {/* Card 3 - UnderpaymentLogic */}
            <div className="bg-white/95 rounded-xl border-l-[6px] border-l-gray-400 p-6 flex flex-col justify-between text-[#0a1628]/80 shadow-md">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="font-display font-extrabold text-xl text-gray-700">UnderpaymentLogic</h3>
                  <span className="inline-flex items-center rounded-md bg-gray-50 px-2 py-1 text-xs font-semibold text-gray-500 ring-1 ring-inset ring-gray-200">
                    Coming Soon
                  </span>
                </div>
                <p className="text-gray-500 text-sm leading-relaxed">
                  Compare every remittance against your contracted rates. Surface underpayments automatically and generate dispute documentation.
                </p>
              </div>
            </div>

            {/* Card 4 - ContractLogic */}
            <div className="bg-white/95 rounded-xl border-l-[6px] border-l-gray-400 p-6 flex flex-col justify-between text-[#0a1628]/80 shadow-md">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="font-display font-extrabold text-xl text-gray-700">ContractLogic</h3>
                  <span className="inline-flex items-center rounded-md bg-gray-50 px-2 py-1 text-xs font-semibold text-gray-500 ring-1 ring-inset ring-gray-200">
                    Coming Soon
                  </span>
                </div>
                <p className="text-gray-500 text-sm leading-relaxed">
                  Model contract performance by DRG, APC, and service line. Identify where your contracts are underperforming before renewal.
                </p>
              </div>
            </div>

            {/* Card 5 - RevenueIntegrityLogic */}
            <div className="bg-white/95 rounded-xl border-l-[6px] border-l-gray-400 p-6 flex flex-col justify-between text-[#0a1628]/80 shadow-md">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="font-display font-extrabold text-xl text-gray-700">RevenueIntegrityLogic</h3>
                  <span className="inline-flex items-center rounded-md bg-gray-50 px-2 py-1 text-xs font-semibold text-gray-500 ring-1 ring-inset ring-gray-200">
                    Coming Soon
                  </span>
                </div>
                <p className="text-gray-500 text-sm leading-relaxed">
                  Catch charge capture gaps, modifier issues, and missing authorizations before claims go out the door.
                </p>
              </div>
            </div>

            {/* Card 6 - PayerBehaviorLogic */}
            <div className="bg-white/95 rounded-xl border-l-[6px] border-l-gray-400 p-6 flex flex-col justify-between text-[#0a1628]/80 shadow-md">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="font-display font-extrabold text-xl text-gray-700">PayerBehaviorLogic</h3>
                  <span className="inline-flex items-center rounded-md bg-gray-50 px-2 py-1 text-xs font-semibold text-gray-500 ring-1 ring-inset ring-gray-200">
                    Coming Soon
                  </span>
                </div>
                <p className="text-gray-500 text-sm leading-relaxed">
                  Track payer delay patterns, denial behavior trends, and policy shifts to anticipate problems before they hit your AR.
                </p>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* SECTION 5 — HOW IT WORKS */}
      <section id="how-it-works" className="bg-white py-24 px-6 md:px-12 text-center">
        <div className="max-w-7xl mx-auto space-y-16">
          <h2 className="font-display text-3xl md:text-4xl font-extrabold text-[#0a1628] tracking-tight">
            Up and running in days, not months.
          </h2>
          
          <div className="relative">
            {/* Connecting Line */}
            <div className="hidden md:block absolute top-6 left-[16%] right-[16%] h-0.5 bg-gray-200 -z-10" />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-12 relative z-10">
              <div className="space-y-4 bg-white px-4">
                <div className="w-12 h-12 rounded-full bg-[#0a1628] text-white flex items-center justify-center font-display font-bold text-lg mx-auto">
                  1
                </div>
                <h3 className="font-display font-bold text-lg text-[#0a1628]">Connect your data</h3>
                <p className="text-gray-500 text-sm leading-relaxed max-w-xs mx-auto">
                  Upload your Epic prebill export or 835 ERA file. No EHR integration required.
                </p>
              </div>

              <div className="space-y-4 bg-white px-4">
                <div className="w-12 h-12 rounded-full bg-[#0a1628] text-white flex items-center justify-center font-display font-bold text-lg mx-auto">
                  2
                </div>
                <h3 className="font-display font-bold text-lg text-[#0a1628]">RevenueLogic analyzes</h3>
                <p className="text-gray-500 text-sm leading-relaxed max-w-xs mx-auto">
                  The rules engine validates, compares, and categorizes every claim automatically.
                </p>
              </div>

              <div className="space-y-4 bg-white px-4">
                <div className="w-12 h-12 rounded-full bg-[#0a1628] text-white flex items-center justify-center font-display font-bold text-lg mx-auto">
                  3
                </div>
                <h3 className="font-display font-bold text-lg text-[#0a1628]">Your team acts</h3>
                <p className="text-gray-500 text-sm leading-relaxed max-w-xs mx-auto">
                  Billing staff see exactly what to do on each claim — route, appeal, dispute, or escalate.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 6 — DIFFERENTIATION */}
      <section className="bg-[#f8fafc] py-24 px-6 md:px-12">
        <div className="max-w-7xl mx-auto space-y-16">
          <h2 className="font-display text-3xl md:text-4xl font-extrabold text-[#0a1628] text-center tracking-tight">
            Built differently than every other RCM vendor.
          </h2>

          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
              <thead>
                <tr className="bg-[#0a1628] text-white font-display text-sm font-semibold">
                  <th className="px-6 py-4">Feature</th>
                  <th className="px-6 py-4">Traditional RCM Consultants</th>
                  <th className="px-6 py-4">RevenueLogic</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 text-[#0a1628]">
                <tr className="bg-white">
                  <td className="px-6 py-4 font-semibold">Pricing model</td>
                  <td className="px-6 py-4 text-gray-500">Percentage of recovery (15-25%)</td>
                  <td className="px-6 py-4 font-bold text-[#2563eb]">Flat monthly SaaS fee</td>
                </tr>
                <tr className="bg-gray-50/50">
                  <td className="px-6 py-4 font-semibold">Time to value</td>
                  <td className="px-6 py-4 text-gray-500">60-90 days</td>
                  <td className="px-6 py-4 font-bold text-[#2563eb]">Days</td>
                </tr>
                <tr className="bg-white">
                  <td className="px-6 py-4 font-semibold">BlueCard routing</td>
                  <td className="px-6 py-4 text-gray-500">Manual, claim by claim</td>
                  <td className="px-6 py-4 font-bold text-[#2563eb]">Automated on every claim</td>
                </tr>
                <tr className="bg-gray-50/50">
                  <td className="px-6 py-4 font-semibold">Denial analysis</td>
                  <td className="px-6 py-4 text-gray-500">Periodic reports</td>
                  <td className="px-6 py-4 font-bold text-[#2563eb]">Real-time with root cause</td>
                </tr>
                <tr className="bg-white">
                  <td className="px-6 py-4 font-semibold">Works with Epic</td>
                  <td className="px-6 py-4 text-gray-500">Requires integration project</td>
                  <td className="px-6 py-4 font-bold text-[#2563eb]">Upload CSV from existing workflow</td>
                </tr>
                <tr className="bg-gray-50/50">
                  <td className="px-6 py-4 font-semibold">Your team keeps</td>
                  <td className="px-6 py-4 text-gray-500">Shares recovery revenue</td>
                  <td className="px-6 py-4 font-bold text-[#2563eb]">100% of recovered revenue</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* SECTION 8 — CTA BANNER */}
      <section className="bg-[#0a1628] py-28 px-6 md:px-12 text-center text-white">
        <div className="max-w-4xl mx-auto space-y-6">
          <h2 className="font-display text-3xl md:text-4xl lg:text-5xl font-extrabold tracking-tight">
            Ready to recover the revenue you&apos;ve already earned?
          </h2>
          <p className="text-gray-400 text-base md:text-lg max-w-xl mx-auto">
            Request a demo and see RevenueLogic running on your data in 30 minutes.
          </p>
          <div className="pt-6">
            <Link 
              href="/contact" 
              className="bg-[#2563eb] hover:bg-blue-700 text-white px-8 py-4 rounded-md font-bold text-base transition-all duration-300 inline-block"
            >
              Request a Demo
            </Link>
          </div>
        </div>
      </section>

      {/* SECTION 9 — FOOTER */}
      <footer className="bg-[#0a1628] text-gray-400 border-t border-white/10 py-12 px-6 md:px-12">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8 items-center text-center md:text-left">
          
          <div className="space-y-2">
            <div className="font-display font-extrabold text-lg text-white">
              RevenueLogic
            </div>
            <p className="text-xs text-gray-500">
              Revenue cycle intelligence for modern healthcare.
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-6 text-xs font-semibold">
            <a href="#platform" className="hover:text-white transition-colors">Platform</a>
            <a href="#modules" className="hover:text-white transition-colors">Modules</a>
            <Link href="/contact" className="hover:text-white transition-colors">Contact</Link>
            <Link href="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link>
          </div>

          <div className="text-xs text-gray-500 md:text-right">
            &copy; 2026 RevenueLogic. All rights reserved.
          </div>

        </div>
      </footer>

    </div>
  )
}
