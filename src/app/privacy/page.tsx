import { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: "Privacy Policy | RevenueLogic",
  description: "Learn how RevenueLogic protects your healthcare claims data and personal information in accordance with HIPAA and industry-standard security guidelines.",
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white text-[#0a1628] font-sans antialiased flex flex-col justify-between selection:bg-[#2563eb] selection:text-white">
      
      {/* HEADER NAV */}
      <nav id="header-nav" className="bg-[#0a1628] border-b border-white/10 py-4 fixed top-0 w-full z-50">
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex justify-between items-center">
          <Link id="nav-logo" href="/" className="font-display font-extrabold text-xl tracking-tight text-white hover:opacity-90 transition-opacity">
            RevenueLogic
          </Link>
          <div className="hidden md:flex space-x-8 items-center text-sm font-semibold text-gray-300">
            <Link id="nav-link-platform" href="/#platform" className="hover:text-white transition-colors">Platform</Link>
            <Link id="nav-link-modules" href="/#modules" className="hover:text-white transition-colors">Modules</Link>
            <Link id="nav-link-contact" href="/contact" className="hover:text-white transition-colors">Contact</Link>
          </div>
          <div className="flex items-center space-x-6">
            <Link id="nav-link-signin" href="/login" className="text-white hover:text-gray-300 transition-colors text-sm font-semibold">
              Sign In
            </Link>
            <Link 
              id="nav-btn-demo"
              href="/contact" 
              className="bg-[#2563eb] text-white hover:bg-blue-700 px-5 py-2 rounded-md font-semibold text-sm transition-all duration-300 inline-block"
            >
              Request Demo
            </Link>
          </div>
        </div>
      </nav>

      {/* CONTENT AREA */}
      <main id="privacy-content" className="flex-1 pt-32 pb-24 px-6 md:px-12 bg-white">
        <article className="max-w-[800px] mx-auto">
          
          <h1 id="privacy-title" className="font-display text-4xl md:text-5xl font-extrabold text-[#0a1628] tracking-tight mb-2">
            Privacy Policy
          </h1>
          <p id="privacy-date" className="text-sm text-gray-500 font-medium mb-8">
            Last updated: May 2026
          </p>
          <hr className="border-gray-200 my-8" />

          {/* POLICY SECTIONS */}
          <div className="space-y-10 text-gray-600 leading-relaxed text-sm md:text-base">
            
            <section id="sec-overview" className="space-y-3">
              <h2 className="font-display text-xl font-bold text-[#0a1628]">1. Overview</h2>
              <p>
                RevenueLogic is a revenue cycle intelligence platform built for healthcare providers. We are committed to protecting the privacy and security of all data entrusted to us, including protected health information (PHI) as defined under HIPAA.
              </p>
            </section>

            <section id="sec-info-collect" className="space-y-3">
              <h2 className="font-display text-xl font-bold text-[#0a1628]">2. Information We Collect</h2>
              <p>
                We collect information necessary to provide our services, including: account information (name, email, organization), healthcare claims data uploaded by your organization, usage data and platform analytics, and technical data such as IP addresses and browser type.
              </p>
            </section>

            <section id="sec-info-use" className="space-y-3">
              <h2 className="font-display text-xl font-bold text-[#0a1628]">3. How We Use Your Information</h2>
              <p>
                Information is used solely to provide, operate, and improve the RevenueLogic platform. We do not sell, rent, or share your data with third parties for marketing purposes. Claims data and PHI uploaded to the platform is used exclusively for processing and analysis on behalf of your organization.
              </p>
            </section>

            <section id="sec-hipaa" className="space-y-3">
              <h2 className="font-display text-xl font-bold text-[#0a1628]">4. HIPAA Compliance</h2>
              <p>
                RevenueLogic acts as a Business Associate under HIPAA when processing protected health information on behalf of covered entities. We execute Business Associate Agreements (BAAs) with all clients prior to processing PHI. We implement appropriate administrative, physical, and technical safeguards to protect PHI in accordance with HIPAA requirements.
              </p>
            </section>

            <section id="sec-data-security" className="space-y-3">
              <h2 className="font-display text-xl font-bold text-[#0a1628]">5. Data Security</h2>
              <p>
                We use industry-standard security measures including encryption in transit (TLS) and at rest, role-based access controls, audit logging, and regular security reviews. Access to PHI is restricted to authorized personnel only.
              </p>
            </section>

            <section id="sec-data-retention" className="space-y-3">
              <h2 className="font-display text-xl font-bold text-[#0a1628]">6. Data Retention</h2>
              <p>
                Client data is retained for the duration of the service agreement. Upon termination, data is deleted or returned per the terms of your Business Associate Agreement. We do not retain PHI beyond what is required to fulfill our contractual obligations.
              </p>
            </section>

            <section id="sec-rights" className="space-y-3">
              <h2 className="font-display text-xl font-bold text-[#0a1628]">7. Your Rights</h2>
              <p>
                You have the right to access, correct, or request deletion of your personal information. To exercise these rights, contact us at the address below. Healthcare organizations retain all rights to their claims data uploaded to the platform.
              </p>
            </section>

            <section id="sec-cookies" className="space-y-3">
              <h2 className="font-display text-xl font-bold text-[#0a1628]">8. Cookies and Tracking</h2>
              <p>
                RevenueLogic uses essential cookies for authentication and session management. We do not use third-party advertising cookies or tracking pixels.
              </p>
            </section>

            <section id="sec-changes" className="space-y-3">
              <h2 className="font-display text-xl font-bold text-[#0a1628]">9. Changes to This Policy</h2>
              <p>
                We may update this policy periodically. We will notify clients of material changes via email or in-platform notification. Continued use of the platform after changes constitutes acceptance of the updated policy.
              </p>
            </section>

            <section id="sec-contact" className="space-y-3">
              <h2 className="font-display text-xl font-bold text-[#0a1628]">10. Contact Us</h2>
              <p>
                For privacy-related questions or to request a Business Associate Agreement, contact us through the Contact page at{" "}
                <Link id="link-contact-domain" href="/contact" className="text-[#2563eb] hover:underline font-semibold">
                  revenuelogic.com/contact
                </Link>
                .
              </p>
            </section>

          </div>

        </article>
      </main>

      {/* FOOTER */}
      <footer id="footer-nav" className="bg-[#0a1628] text-gray-400 border-t border-white/10 py-12 px-6 md:px-12">
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
            <Link id="footer-link-platform" href="/#platform" className="hover:text-white transition-colors">Platform</Link>
            <Link id="footer-link-modules" href="/#modules" className="hover:text-white transition-colors">Modules</Link>
            <Link id="footer-link-contact" href="/contact" className="hover:text-white transition-colors">Contact</Link>
            <Link id="footer-link-privacy" href="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link>
          </div>

          <div className="text-xs text-gray-500 md:text-right">
            &copy; 2026 RevenueLogic. All rights reserved.
          </div>

        </div>
      </footer>

    </div>
  )
}
