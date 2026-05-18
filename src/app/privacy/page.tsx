import Link from 'next/link'

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white text-[#0a1628] font-sans selection:bg-[#2563eb] selection:text-white overflow-x-hidden">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-white/85 backdrop-blur-md border-b border-gray-200 py-4 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex justify-between items-center">
          <Link href="/" className="font-display font-bold text-xl tracking-tight text-[#0a1628] hover:text-[#2563eb] transition-colors">
            BlueCard Platform
          </Link>
          <div className="hidden md:flex space-x-8 items-center text-sm font-medium">
            <Link href="/#how-it-works" className="text-gray-600 hover:text-[#2563eb] transition-colors">How It Works</Link>
            <Link href="/#features" className="text-gray-600 hover:text-[#2563eb] transition-colors">Features</Link>
            <Link href="/#results" className="text-gray-600 hover:text-[#2563eb] transition-colors">Results</Link>
            <Link href="/login" className="text-[#0a1628] hover:text-[#2563eb] transition-colors">
              Log In
            </Link>
            <Link href="/contact" className="bg-[#0a1628] text-white px-5 py-2.5 rounded-md hover:bg-[#2563eb] transition-all duration-300 hover:scale-[1.02]">
              Request Demo
            </Link>
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="max-w-4xl mx-auto px-6 md:px-12 pt-32 pb-24">
        <h1 className="font-display text-4xl md:text-5xl font-bold tracking-tight text-[#0a1628] mb-4">
          Privacy Policy
        </h1>
        <p className="text-sm text-gray-500 mb-12">Last Updated: May 18, 2026</p>

        <div className="space-y-12 text-gray-700 leading-relaxed">
          {/* Information We Collect */}
          <section className="space-y-4">
            <h2 className="text-2xl font-bold text-[#0a1628]">Information We Collect</h2>
            <p>
              We collect information to provide better services to our users. This includes:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Account Information:</strong> When you register for an account, we collect your email address, password, organization details, and role specifications.</li>
              <li><strong>Claim Data:</strong> CSV or electronic files uploaded to the platform containing patient identifiers, claim dates of service, billing codes, and payment rate estimates necessary for routing optimization.</li>
              <li><strong>Usage Details:</strong> Log files, action history, browser types, and session duration data collected automatically via analytics to ensure platform stability and track performance.</li>
            </ul>
          </section>

          {/* How We Use Your Information */}
          <section className="space-y-4">
            <h2 className="text-2xl font-bold text-[#0a1628]">How We Use Your Information</h2>
            <p>
              The information we collect is utilized strictly to deliver, maintain, and optimize our services:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>To execute our proprietary rules engine and provide accurate, automated BCBS plan routing recommendations.</li>
              <li>To detect duplicate patient claims across distinct billing batches.</li>
              <li>To provide support, send security notifications, and communicate account alerts.</li>
              <li>To compile aggregate, anonymized benchmark metrics such as client savings and prefix verification statistics.</li>
            </ul>
          </section>

          {/* Data Security */}
          <section className="space-y-4">
            <h2 className="text-2xl font-bold text-[#0a1628]">Data Security</h2>
            <p>
              We implement comprehensive physical, technical, and administrative security measures designed to protect your information:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>All claims, database records, and session tokens are encrypted in transit using TLS 1.3 and at rest using AES-256 standard encryption.</li>
              <li>Strict access control policies limit access to backend infrastructure to authorized engineering personnel under multi-factor authentication.</li>
              <li>Continuous log monitoring and regular security vulnerability scanning to prevent unauthorized intrusion.</li>
            </ul>
          </section>

          {/* HIPAA Compliance */}
          <section className="space-y-4">
            <h2 className="text-2xl font-bold text-[#0a1628]">HIPAA Compliance</h2>
            <p>
              As a provider-facing prebill routing solution, BlueCard Platform acts as a Business Associate under the Health Insurance Portability and Accountability Act (HIPAA).
            </p>
            <p>
              We are fully committed to protecting Protected Health Information (PHI). We enter into Business Associate Agreements (BAAs) with all of our clients, ensuring full adherence to HIPAA Privacy, Security, and Breach Notification Rules.
            </p>
          </section>

          {/* Contact Us */}
          <section className="space-y-4">
            <h2 className="text-2xl font-bold text-[#0a1628]">Contact Us</h2>
            <p>
              If you have any questions or concerns regarding this Privacy Policy, please contact our privacy compliance team:
            </p>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 space-y-2">
              <p className="font-semibold text-[#0a1628]">BlueCard Platform Privacy Operations</p>
              <p>Email: <a href="mailto:privacy@bluecardplatform.com" className="text-[#2563eb] hover:underline">privacy@bluecardplatform.com</a></p>
              <p>Support URL: <Link href="/contact" className="text-[#2563eb] hover:underline">Contact Support Form</Link></p>
            </div>
          </section>
        </div>

        {/* Back to Home link at bottom */}
        <div className="mt-16 pt-8 border-t border-gray-200 flex justify-between items-center">
          <Link href="/" className="text-sm font-semibold text-[#2563eb] hover:text-blue-700 flex items-center space-x-2 transition-colors">
            <span>&larr;</span> <span>Back to Home</span>
          </Link>
          <span className="text-sm text-gray-400">&copy; 2026 BlueCard Platform LLC</span>
        </div>
      </main>
    </div>
  )
}
