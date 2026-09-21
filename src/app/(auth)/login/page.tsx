import AuthShell from "@/components/auth/AuthShell";
import LoginForm from "@/components/auth/LoginForm";

export default function LoginPage() {
  return (
    <AuthShell brandTag="SYSTEM INITIALIZATION">
      <h1 className="mb-gutter text-2xl font-semibold tracking-tight text-primary">
        Iniciar Sesión
      </h1>
      <p className="mb-margin text-on-surface-variant">
        Accede a la mesa de dibujo.
      </p>
      <LoginForm />
    </AuthShell>
  );
}