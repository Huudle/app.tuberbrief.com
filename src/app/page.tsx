import Image from "next/image";

export default function Home() {
  return (
    <div className="grid grid-rows-[20px_1fr_20px] min-h-screen p-8 pb-20 gap-16 sm:p-20">
      <main className="flex flex-col gap-8 row-start-2 items-center justify-center">
        <div className="text-center max-w-3xl">
          <div className="flex justify-center mb-8">
            <Image
              src="/logo-001.png"
              alt="Flow Fusion Logo"
              width={512}
              height={512}
              priority
              className="dark:invert"
            />
          </div>
          <p className="text-xl text-gray-600 dark:text-gray-300">
            Your intelligent YouTube companion that monitors channels, generates
            AI-powered video summaries, and delivers insights straight to your
            inbox.
          </p>
        </div>

        <div className="flex gap-4 items-center flex-col sm:flex-row mt-8">
          <a
            className="rounded-full border border-solid border-transparent transition-colors flex items-center justify-center bg-foreground text-background gap-2 hover:bg-[#383838] dark:hover:bg-[#ccc] text-sm sm:text-base h-10 sm:h-12 px-8 sm:px-10"
            href="/login"
          >
            Get Started
          </a>
        </div>
      </main>

      <footer className="row-start-3 text-center text-sm text-gray-500 dark:text-gray-400">
        © {new Date().getFullYear()} Flow Fusion. All rights reserved.
      </footer>
    </div>
  );
}
