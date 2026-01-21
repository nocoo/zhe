import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-black text-white">
      <div className="text-center">
        <h1 className="text-6xl font-bold mb-4">404</h1>
        <p className="text-xl text-gray-400 mb-8">Link not found</p>
        <Link 
          href="/"
          className="text-gray-500 hover:text-white transition-colors"
        >
          ← Back to home
        </Link>
      </div>
    </div>
  );
}
