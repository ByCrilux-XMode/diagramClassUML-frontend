import AuthShell from "@/components/auth/AuthShell";
import RegistroForm from "@/components/auth/RegistroForm";

export default function RegistroPage() {
  return (
    <AuthShell brandTag="ACCOUNT CREATION">
      <h1 className="mb-gutter text-2xl font-semibold tracking-tight text-primary">
        Crear Cuenta
      </h1>
      <p className="mb-margin text-on-surface-variant">
        Regístrate para empezar a modelar.
      </p>
      <RegistroForm />
    </AuthShell>
  );
}