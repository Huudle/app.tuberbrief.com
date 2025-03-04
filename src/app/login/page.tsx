"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabaseAnon } from "@/lib/supabase";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { logger } from "@/lib/logger";
import Image from "next/image";

function LoginForm() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message] = useState<string | null>(searchParams.get("message"));
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    logger.info("Login attempt started", {
      prefix: "Auth",
      data: { email: formData.email },
    });
    setError(null);
    setLoading(true);

    try {
      logger.debug("Attempting to sign in with Supabase", {
        prefix: "Auth",
      });
      const { data, error: signInError } =
        await supabaseAnon.auth.signInWithPassword({
          email: formData.email,
          password: formData.password,
        });

      if (signInError) {
        logger.error("Supabase signin error", {
          prefix: "Auth",
          data: { error: signInError.message },
        });
        throw signInError;
      }

      if (data?.session) {
        // Call the auth callback endpoint to set the cookie
        const response = await fetch("/api/auth/callback", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            event: "SIGNED_IN",
            session: data.session,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to set session cookie");
        }

        logger.info("Login successful, redirecting to dashboard", {
          prefix: "Auth",
          data: { userId: data.session.user.id },
        });
        window.location.href = "/dashboard/channels";
      } else {
        logger.error("No session data received from Supabase", {
          prefix: "Auth",
        });
        throw new Error("No session returned from login");
      }
    } catch (err) {
      logger.error("Login error", {
        prefix: "Auth",
        data: {
          error: err instanceof Error ? err.message : "Unknown error",
          stack: err instanceof Error ? err.stack : undefined,
        },
      });
      setError(err instanceof Error ? err.message : "An error occurred");
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 gap-8">
      <div className="flex justify-center">
        <Image
          src="/logo-001.png"
          alt="TuberBrief Logo"
          width={180}
          height={180}
          priority
          className="h-auto w-auto dark:invert"
        />
      </div>
      <Card className="w-full max-w-md">
        <form onSubmit={handleSubmit}>
          <CardHeader>
            <CardTitle>Welcome back</CardTitle>
            <CardDescription>
              Sign in to your TuberBrief account to continue
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {message && (
              <div className="text-sm text-green-500 dark:text-green-400">
                {message}
              </div>
            )}
            {error && (
              <div className="text-sm text-red-500 dark:text-red-400">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="Enter your email"
                value={formData.email}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={formData.password}
                onChange={(e) =>
                  setFormData({ ...formData, password: e.target.value })
                }
              />
              <div className="text-right">
                <a
                  href="/forgot-password"
                  className="text-sm text-primary hover:underline"
                >
                  Forgot password?
                </a>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button className="w-full" type="submit" disabled={loading}>
              {loading ? "Signing in..." : "Sign In"}
            </Button>
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
              Don&apos;t have an account?{" "}
              <a href="/signup" className="text-primary hover:underline">
                Sign up
              </a>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
