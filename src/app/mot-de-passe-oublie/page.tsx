"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { AuthCard } from "@/components/auth/AuthCard";
import { FormField } from "@/components/auth/FormField";
import { FormAlert } from "@/components/auth/FormAlert";
import { SubmitButton } from "@/components/auth/SubmitButton";

export default function MotDePasseOubliePage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reinitialiser-mot-de-passe`,
    });

    setLoading(false);

    if (error) {
      setError("Une erreur est survenue. Réessayez.");
      return;
    }

    // Toujours afficher un succès, même si l'e-mail n'existe pas dans la
    // base : ne jamais révéler quelles adresses sont enregistrées.
    setSent(true);
  }

  if (sent) {
    return (
      <AuthCard
        title="E-mail envoyé"
        subtitle="Vérifiez votre boîte de réception."
      >
        <FormAlert
          type="success"
          message={`Si un compte existe pour ${email}, un lien de réinitialisation vient d'être envoyé.`}
        />
        <Link
          href="/connexion"
          className="block text-center text-sm font-medium text-accent-600 hover:text-accent-700"
        >
          Retour à la connexion
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Mot de passe oublié"
      subtitle="Recevez un lien pour réinitialiser votre mot de passe."
      footer={
        <Link href="/connexion" className="font-medium text-accent-400">
          Retour à la connexion
        </Link>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {error && <FormAlert message={error} />}

        <FormField
          id="email"
          label="Adresse e-mail"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="vous@onyxpharm.com"
        />

        <SubmitButton loading={loading}>Envoyer le lien</SubmitButton>
      </form>
    </AuthCard>
  );
}
