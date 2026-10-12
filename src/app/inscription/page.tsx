"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { AuthCard } from "@/components/auth/AuthCard";
import { FormField } from "@/components/auth/FormField";
import { FormAlert } from "@/components/auth/FormAlert";
import { SubmitButton } from "@/components/auth/SubmitButton";

export default function InscriptionPage() {
  const [email, setEmail] = useState("");
  const [entrepriseMode, setEntrepriseMode] = useState<"creer" | "rejoindre">("creer");
  const [entrepriseNom, setEntrepriseNom] = useState("");
  const [codeInvitation, setCodeInvitation] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (entrepriseMode === "creer" && entrepriseNom.trim().length < 2) {
      setError("Saisissez le nom de votre entreprise (2 caractères minimum).");
      return;
    }
    if (entrepriseMode === "rejoindre" && codeInvitation.trim().length < 6) {
      setError("Saisissez le code d'invitation fourni par votre entreprise.");
      return;
    }
    if (password.length < 8) {
      setError("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: {
          entreprise_mode: entrepriseMode,
          entreprise_nom: entrepriseMode === "creer" ? entrepriseNom.trim() : null,
          code_invitation: entrepriseMode === "rejoindre" ? codeInvitation.trim().toUpperCase() : null,
        },
      },
    });

    if (error) {
      // eslint-disable-next-line no-console
      console.error("[ONYX PHARM] Erreur auth (signUp)", error);
      const message = error.message || "";
      setError(
        message === "User already registered"
          ? "Un compte existe déjà avec cette adresse e-mail."
          : /Code d.invitation invalide/i.test(message)
            ? "Le code d'invitation est invalide. Vérifiez-le auprès du responsable de l'entreprise."
            : /nom de l.entreprise/i.test(message)
              ? "Saisissez un nom d'entreprise valide."
              : "Une erreur est survenue lors de la création du compte. Vérifiez les informations et réessayez."
      );
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);
  }

  if (success) {
    return (
      <AuthCard
        title="Vérifiez votre e-mail"
        subtitle="Dernière étape avant l'accès à votre espace."
      >
        <FormAlert
          type="success"
          message={`Un e-mail de confirmation a été envoyé à ${email}. Cliquez sur le lien qu'il contient pour activer votre compte.${entrepriseMode === "creer" ? " Votre espace d'entreprise sera initialisé automatiquement." : " Vous serez rattaché à l'entreprise correspondant au code d'invitation."}`}
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
      title="Créer un compte"
      subtitle="Créez un espace d'entreprise ou rejoignez celui de votre équipe."
      footer={
        <>
          Déjà un compte ?{" "}
          <Link href="/connexion" className="font-medium text-accent-400">
            Se connecter
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {error && <FormAlert message={error} />}

        <div className="space-y-2">
          <p className="text-sm font-medium text-onyx-700">Espace de travail</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setEntrepriseMode("creer")}
              className={`rounded-lg border px-3 py-2.5 text-sm font-medium transition ${entrepriseMode === "creer" ? "border-accent-500 bg-accent-50 text-accent-700 ring-1 ring-accent-200" : "border-onyx-200 bg-white text-onyx-600 hover:bg-onyx-50"}`}
              aria-pressed={entrepriseMode === "creer"}
            >
              Nouvelle entreprise
            </button>
            <button
              type="button"
              onClick={() => setEntrepriseMode("rejoindre")}
              className={`rounded-lg border px-3 py-2.5 text-sm font-medium transition ${entrepriseMode === "rejoindre" ? "border-accent-500 bg-accent-50 text-accent-700 ring-1 ring-accent-200" : "border-onyx-200 bg-white text-onyx-600 hover:bg-onyx-50"}`}
              aria-pressed={entrepriseMode === "rejoindre"}
            >
              Rejoindre une entreprise
            </button>
          </div>
          {entrepriseMode === "creer" ? (
            <FormField
              id="entrepriseNom"
              label="Nom de l'entreprise"
              value={entrepriseNom}
              onChange={(e) => setEntrepriseNom(e.target.value)}
              placeholder="Ex. : ONYX PHARM SARL"
              autoComplete="organization"
              required
            />
          ) : (
            <>
              <FormField
                id="codeInvitation"
                label="Code d'invitation"
                value={codeInvitation}
                onChange={(e) => setCodeInvitation(e.target.value.toUpperCase())}
                placeholder="Ex. : A1B2C3D4E5F6A7B8"
                autoComplete="off"
                required
              />
              <p className="text-xs leading-5 text-onyx-500">
                Demandez ce code au responsable de l&apos;entreprise. Il permet de rattacher votre compte au bon espace sans mélanger les données.
              </p>
            </>
          )}
        </div>

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

        <FormField
          id="password"
          label="Mot de passe"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="8 caractères minimum"
        />

        <FormField
          id="confirmPassword"
          label="Confirmer le mot de passe"
          type="password"
          autoComplete="new-password"
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="••••••••"
        />

        <SubmitButton loading={loading}>Créer mon compte</SubmitButton>
      </form>
    </AuthCard>
  );
}
