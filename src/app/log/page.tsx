import { LogForm } from "./log-form";

export default function LogPage() {
  return (
    <main className="mx-auto w-full max-w-lg flex-1 p-5 pb-16">
      <h1 className="mb-5 text-2xl font-bold tracking-tight">
        Registrar atividade
      </h1>
      <LogForm />
    </main>
  );
}
