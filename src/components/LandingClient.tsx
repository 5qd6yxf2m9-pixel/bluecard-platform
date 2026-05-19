'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

interface ClaimExample {
  claim: string;
  type: string;
  charge: number;
  anthem: number;
  bs: number;
  uplift: number;
  winner: 'anthem' | 'bs';
}

const EXAMPLES: ClaimExample[] = [
  {
    claim: '#PT2847',
    type: 'PPO',
    charge: 4200,
    anthem: 3570,
    bs: 3276,
    uplift: 294,
    winner: 'anthem',
  },
  {
    claim: '#PT1093',
    type: 'HMO',
    charge: 2800,
    anthem: 2240,
    bs: 2352,
    uplift: 112,
    winner: 'bs',
  },
  {
    claim: '#PT3761',
    type: 'PPO',
    charge: 6500,
    anthem: 5525,
    bs: 5070,
    uplift: 455,
    winner: 'anthem',
  },
  {
    claim: '#PT8834',
    type: 'HMO',
    charge: 1900,
    anthem: 1520,
    bs: 1634,
    uplift: 114,
    winner: 'bs',
  },
  {
    claim: '#PT5219',
    type: 'PPO',
    charge: 9100,
    anthem: 7735,
    bs: 7098,
    uplift: 637,
    winner: 'anthem',
  },
];

function HeroAnimation() {
  const [index, setIndex] = useState(0);
  const [fade, setFade] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setIndex((prevIndex) => (prevIndex + 1) % EXAMPLES.length);
        setFade(true);
      }, 400);
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  const current = EXAMPLES[index];
  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(val);

  return (
    <div className="relative w-full max-w-[500px] mx-auto aspect-[4/3] flex items-center justify-center">
      <div className="w-full bg-white rounded-xl shadow-2xl shadow-navy/10 border border-gray-100 p-6 min-h-[300px] flex flex-col justify-between">
        <div className={`transition-all duration-300 ${fade ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'}`}>
          
          {/* Header */}
          <div className="flex justify-between items-center mb-6 pb-4 border-b border-gray-100">
            <div>
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Incoming Claim</div>
              <div className="font-display font-bold text-lg text-navy">{current.claim} | {current.type}</div>
            </div>
            <div className="text-right">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Billed Charge</div>
              <div className="font-display font-bold text-xl text-gray-900">{formatCurrency(current.charge)}</div>
            </div>
          </div>

          {/* Comparisons */}
          <div className="space-y-3">
            
            {/* Anthem Row */}
            <div className={`flex justify-between items-center p-3 rounded-lg border transition-all duration-300 ${
              current.winner === 'anthem'
                ? 'border-electric bg-blue-50/50 shadow-[0_0_15px_rgba(0,102,255,0.15)] scale-[1.02]'
                : 'border-gray-200 bg-gray-50/50'
            }`}>
              <div className="flex items-center space-x-2 flex-shrink-0">
                <div className="font-semibold text-navy text-lg whitespace-nowrap">Anthem Blue Cross</div>
                {current.winner === 'anthem' && (
                  <div className="flex items-center space-x-1 bg-green-100 text-green-700 px-2 py-0.5 rounded text-xs font-bold whitespace-nowrap flex-shrink-0">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Route</span>
                  </div>
                )}
              </div>
              
              <div className="flex items-center space-x-3 flex-shrink-0">
                {current.winner === 'anthem' && (
                  <span className="bg-electric text-white text-xs font-bold px-2.5 py-1 rounded-full shadow-sm whitespace-nowrap flex-shrink-0">
                    +{formatCurrency(current.uplift)} uplift
                  </span>
                )}
                <div className={`font-extrabold text-xl whitespace-nowrap ${current.winner === 'anthem' ? 'text-electric' : 'text-gray-900'}`}>
                  {formatCurrency(current.anthem)}
                </div>
              </div>
            </div>

            {/* Blue Shield Row */}
            <div className={`flex justify-between items-center p-3 rounded-lg border transition-all duration-300 ${
              current.winner === 'bs'
                ? 'border-electric bg-blue-50/50 shadow-[0_0_15px_rgba(0,102,255,0.15)] scale-[1.02]'
                : 'border-gray-200 bg-gray-50/50'
            }`}>
              <div className="flex items-center space-x-2 flex-shrink-0">
                <div className="font-semibold text-navy text-lg whitespace-nowrap">Blue Shield of CA</div>
                {current.winner === 'bs' && (
                  <div className="flex items-center space-x-1 bg-green-100 text-green-700 px-2 py-0.5 rounded text-xs font-bold whitespace-nowrap flex-shrink-0">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Route</span>
                  </div>
                )}
              </div>
              
              <div className="flex items-center space-x-3 flex-shrink-0">
                {current.winner === 'bs' && (
                  <span className="bg-electric text-white text-xs font-bold px-2.5 py-1 rounded-full shadow-sm whitespace-nowrap flex-shrink-0">
                    +{formatCurrency(current.uplift)} uplift
                  </span>
                )}
                <div className={`font-extrabold text-xl whitespace-nowrap ${current.winner === 'bs' ? 'text-electric' : 'text-gray-900'}`}>
                  {formatCurrency(current.bs)}
                </div>
              </div>
            </div>

          </div>

        </div>
      </div>
    </div>
  );
}

export function LandingClient() {
  const [scrolled, setScrolled] = useState(false)
  const sectionsRef = useRef<(HTMLElement | null)[]>([])

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('opacity-100', 'translate-y-0')
            entry.target.classList.remove('opacity-0', 'translate-y-8')
          }
        })
      },
      { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
    )

    sectionsRef.current.forEach((ref) => {
      if (ref) observer.observe(ref)
    })

    return () => observer.disconnect()
  }, [])

  const addToRefs = (el: HTMLElement | null) => {
    if (el && !sectionsRef.current.includes(el)) {
      sectionsRef.current.push(el)
    }
  }

  return (
    <div className="min-h-screen bg-white text-navy selection:bg-electric selection:text-white font-sans overflow-x-hidden">
      {/* Navigation */}
      <nav className={`fixed top-0 w-full z-50 transition-all duration-300 ${scrolled ? 'bg-white/80 backdrop-blur-md border-b border-gray-200 py-3' : 'bg-transparent py-5'}`}>
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex justify-between items-center">
          <div className="font-display font-bold text-xl tracking-tight text-navy">RevenueLogic</div>
          <div className="hidden md:flex space-x-8 items-center text-sm font-medium">
            <a href="#how-it-works" className="hover:text-electric transition-colors">How It Works</a>
            <a href="#features" className="hover:text-electric transition-colors">Features</a>
            <a href="#results" className="hover:text-electric transition-colors">Results</a>
            <Link href="/login" className="text-navy hover:text-electric transition-colors">
              Log In
            </Link>
            <Link href="/contact" className="bg-navy text-white px-5 py-2.5 rounded-md hover:bg-electric transition-all duration-300 hover:scale-[1.02]">
              Request Demo
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative min-h-screen flex flex-col justify-center pt-24 pb-12 px-6 md:px-12 overflow-hidden">
        {/* Subtle dot background */}
        <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:24px_24px] opacity-40 -z-10" />
        
        <div className="max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          
          <div className="text-center lg:text-left animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-300 fill-mode-both">
            <h1 className="font-display text-5xl md:text-6xl xl:text-7xl font-bold tracking-tight text-navy mb-6 leading-tight">
              Stop Leaving Money<br className="hidden md:block" /> on the Table.
            </h1>
            <p className="text-xl text-gray-600 mb-10 max-w-2xl mx-auto lg:mx-0 font-light leading-relaxed">
              RevenueLogic automatically routes your BCBS claims to the highest-paying local plan and flags billing exceptions — before you bill.
            </p>
            <div className="flex flex-col sm:flex-row justify-center lg:justify-start items-center space-y-4 sm:space-y-0 sm:space-x-4 mb-12">
              <Link href="/contact" className="w-full sm:w-auto bg-navy text-white px-8 py-4 rounded-md font-medium text-lg hover:bg-electric transition-all duration-300 hover:scale-[1.02] shadow-lg shadow-electric/10 text-center">
                Request a Demo
              </Link>
              <a href="#how-it-works" className="w-full sm:w-auto bg-white text-navy border border-gray-300 px-8 py-4 rounded-md font-medium text-lg hover:bg-gray-50 transition-all duration-300 hover:scale-[1.02] text-center">
                See How It Works
              </a>
            </div>
            
            <div className="flex flex-col sm:flex-row justify-center lg:justify-start items-center gap-4">
              <div className="animate-in fade-in duration-700 delay-[500ms] fill-mode-both px-4 py-2 bg-white rounded-full border border-gray-200 text-sm font-medium text-gray-700 shadow-sm">
                <span className="text-electric font-bold">$5.5M</span> recovered for clients
              </div>
              <div className="animate-in fade-in duration-700 delay-[600ms] fill-mode-both px-4 py-2 bg-white rounded-full border border-gray-200 text-sm font-medium text-gray-700 shadow-sm">
                <span className="text-electric font-bold">2,744</span> prefixes validated
              </div>
              <div className="animate-in fade-in duration-700 delay-[700ms] fill-mode-both px-4 py-2 bg-white rounded-full border border-gray-200 text-sm font-medium text-gray-700 shadow-sm">
                <span className="text-electric font-bold">100%</span> prebill analysis
              </div>
            </div>
          </div>

          <div className="animate-in fade-in slide-in-from-right-8 duration-1000 delay-500 fill-mode-both mt-12 lg:mt-0">
            <HeroAnimation />
          </div>

        </div>
      </section>

      {/* Problem Section */}
      <section ref={addToRefs} className="py-24 px-6 md:px-12 bg-white opacity-0 translate-y-8 transition-all duration-1000">
        <div className="max-w-7xl mx-auto">
          <h2 className="font-display text-3xl md:text-4xl font-bold mb-12 text-center">Sound familiar?</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="p-8 border border-gray-200 rounded-xl hover:border-gray-300 transition-colors bg-gray-50/50">
              <h3 className="font-display text-xl font-bold mb-3">You&apos;re routing BlueCard claims manually</h3>
              <p className="text-gray-600">Your team spends countless hours trying to determine which local plan to bill, leading to costly errors and delays.</p>
            </div>
            <div className="p-8 border border-gray-200 rounded-xl hover:border-gray-300 transition-colors bg-gray-50/50">
              <h3 className="font-display text-xl font-bold mb-3">You don&apos;t know which plan pays more</h3>
              <p className="text-gray-600">Without real-time contract comparison, you often bill the lower-paying plan, leaving millions in uncollected revenue.</p>
            </div>
            <div className="p-8 border border-gray-200 rounded-xl hover:border-gray-300 transition-colors bg-gray-50/50">
              <h3 className="font-display text-xl font-bold mb-3">Vendors take a cut of every recovery</h3>
              <p className="text-gray-600">Post-payment recovery vendors take a massive percentage. We help you bill it right the first time for a flat SaaS fee.</p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" ref={addToRefs} className="py-24 px-6 md:px-12 bg-gray-50 opacity-0 translate-y-8 transition-all duration-1000">
        <div className="max-w-7xl mx-auto">
          <h2 className="font-display text-3xl md:text-4xl font-bold mb-16 text-center">How it works</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 relative">
            <div className="hidden md:block absolute top-1/2 left-0 w-full h-px bg-gray-200 -z-10 -translate-y-1/2" />
            
            {[
              { num: '1', title: 'Upload', desc: 'Upload your claim file from Epic' },
              { num: '2', title: 'Validate', desc: 'We validate every BlueCard prefix' },
              { num: '3', title: 'Compare', desc: 'We compare Anthem vs Blue Shield rates' },
              { num: '4', title: 'Route', desc: 'You get a routing recommendation instantly' }
            ].map((step, idx) => (
              <div key={idx} className="relative bg-gray-50 pt-8 md:pt-0">
                <div className="w-12 h-12 bg-navy text-white rounded-full flex items-center justify-center font-display font-bold text-xl mb-6 mx-auto border-4 border-gray-50">
                  {step.num}
                </div>
                <h3 className="text-center font-bold text-lg mb-2">{step.title}</h3>
                <p className="text-center text-gray-600 text-sm px-4">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" ref={addToRefs} className="py-24 px-6 md:px-12 bg-white opacity-0 translate-y-8 transition-all duration-1000">
        <div className="max-w-7xl mx-auto">
          <h2 className="font-display text-3xl md:text-4xl font-bold mb-16 text-center">Built for revenue cycle teams</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-8 border border-gray-200 rounded-lg">
              <h3 className="font-display font-bold text-lg mb-2">Prebill routing</h3>
              <p className="text-gray-600">Route claims to the correct plan before they go out the door, eliminating backend rework.</p>
            </div>
            <div className="p-8 border border-gray-200 rounded-lg">
              <h3 className="font-display font-bold text-lg mb-2">Rate comparison</h3>
              <p className="text-gray-600">See exactly which plan pays more and by how much, ensuring maximum legitimate reimbursement.</p>
            </div>
            <div className="p-8 border border-gray-200 rounded-lg">
              <h3 className="font-display font-bold text-lg mb-2">Manual review queue</h3>
              <p className="text-gray-600">Automatically flag exceptions and complex claims for your team to action in a dedicated workspace.</p>
            </div>
            <div className="p-8 border border-gray-200 rounded-lg">
              <h3 className="font-display font-bold text-lg mb-2">Batch processing</h3>
              <p className="text-gray-600">Upload thousands of claims at once. Our engine processes them in chunks to guarantee stability.</p>
            </div>
            <div className="p-8 border border-gray-200 rounded-lg">
              <h3 className="font-display font-bold text-lg mb-2">Prefix validation</h3>
              <p className="text-gray-600">Tap into our database of 2,744 continuously updated and validated BCBS prefixes.</p>
            </div>
            <div className="p-8 border border-gray-200 rounded-lg">
              <h3 className="font-display font-bold text-lg mb-2">Export ready</h3>
              <p className="text-gray-600">Download your routing recommendations as a clean CSV to immediately action within Epic.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Results Section */}
      <section id="results" ref={addToRefs} className="py-24 px-6 md:px-12 bg-navy text-white opacity-0 translate-y-8 transition-all duration-1000">
        <div className="max-w-7xl mx-auto text-center">
          <h2 className="font-display text-3xl md:text-5xl font-bold mb-20">Real results for real providers</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 divide-y md:divide-y-0 md:divide-x divide-gray-700">
            <div className="pt-8 md:pt-0">
              <div className="text-5xl md:text-6xl font-display font-bold text-electric mb-4">$5.5M</div>
              <div className="text-gray-300 font-medium max-w-xs mx-auto">Annual revenue boosted for one client</div>
            </div>
            <div className="pt-12 md:pt-0">
              <div className="text-5xl md:text-6xl font-display font-bold text-electric mb-4">2 weeks</div>
              <div className="text-gray-300 font-medium max-w-xs mx-auto">Average time to first routing recommendation</div>
            </div>
            <div className="pt-12 md:pt-0">
              <div className="text-5xl md:text-6xl font-display font-bold text-electric mb-4">100%</div>
              <div className="text-gray-300 font-medium max-w-xs mx-auto">Revenue claims analyzed before billing</div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section ref={addToRefs} className="py-32 px-6 md:px-12 bg-white text-center opacity-0 translate-y-8 transition-all duration-1000">
        <div className="max-w-3xl mx-auto">
          <h2 className="font-display text-4xl md:text-5xl font-bold mb-6 text-navy">Ready to get paid right?</h2>
          <p className="text-xl text-gray-600 mb-10 font-light">Meet with our team to see how RevenueLogic works for your organization.</p>
          <Link href="/contact" className="inline-block bg-navy text-white px-10 py-5 rounded-md font-medium text-lg hover:bg-electric transition-all duration-300 hover:scale-[1.02] shadow-xl shadow-electric/10 mb-6">
            Request a Demo
          </Link>
          <p className="text-sm text-gray-500">No commitment required. Results in weeks, not months.</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-gray-50 py-12 px-6 md:px-12">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center">
          <div className="font-display font-bold text-lg text-navy mb-4 md:mb-0">RevenueLogic</div>
          <div className="flex space-x-6 text-sm text-gray-500 mb-4 md:mb-0">
            <Link href="/privacy" className="hover:text-navy transition-colors">Privacy Policy</Link>
            <Link href="/contact" className="hover:text-navy transition-colors">Contact</Link>
          </div>
          <div className="text-sm text-gray-400">
            &copy; 2026 RevenueLogic LLC
          </div>
        </div>
      </footer>
    </div>
  )
}
