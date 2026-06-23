export default function AgeBlockedPage() {
  return (
    <main className="min-h-screen bg-bg flex items-center justify-center px-6">
      <div className="w-full max-w-md text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-down/10 border border-down/20 mb-6"><span className="text-3xl">🚫</span></div>
        <h1 className="text-2xl font-bold text-white mb-3">Access Restricted</h1>
        <p className="text-gray-400 leading-relaxed mb-8">You must be <strong className="text-white">18 or older</strong> to use Hype. This platform involves real-money transactions and is not available to minors.</p>
        <div className="bg-card border border-edge rounded-2xl p-5 text-sm text-gray-500">If you believe this is an error, please contact <a href="mailto:iredo2005@gmail.com" className="text-accent hover:underline">iredo2005@gmail.com</a></div>
      </div>
    </main>
  )
}
