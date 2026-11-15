import { DemoApp } from "@/components/demo/demo-app";

/**
 * The demo is one page: Copperline's site with Penny on the left, the owner's
 * dashboard on the right. Everything interactive lives in the browser; the
 * model, price book and documents stay behind /api/chat.
 */
export default function Home() {
  return (
    <DemoApp
      authorName={process.env.NEXT_PUBLIC_AUTHOR_NAME?.trim() ?? ""}
      hireUrl={process.env.NEXT_PUBLIC_HIRE_URL?.trim() ?? ""}
    />
  );
}
