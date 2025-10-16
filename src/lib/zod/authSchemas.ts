import { z } from "zod";

export const signupSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "E-Mail ist erforderlich")
    .email("Ungültige E-Mail-Adresse")
    .max(255, "E-Mail zu lang"),
  password: z
    .string()
    .min(8, "Passwort muss mindestens 8 Zeichen lang sein")
    .max(72, "Passwort zu lang")
    .regex(/[A-Z]/, "Passwort muss mindestens einen Großbuchstaben enthalten")
    .regex(/[a-z]/, "Passwort muss mindestens einen Kleinbuchstaben enthalten")
    .regex(/[0-9]/, "Passwort muss mindestens eine Zahl enthalten"),
  acceptedTerms: z.literal(true, {
    errorMap: () => ({ message: "AGB müssen akzeptiert werden" })
  }),
  acceptedPrivacy: z.literal(true, {
    errorMap: () => ({ message: "Datenschutzerklärung muss akzeptiert werden" })
  })
});

export const loginSchema = z.object({
  email: z.string().email("Ungültige E-Mail-Adresse"),
  password: z.string().min(1, "Passwort ist erforderlich")
});

export type SignupFormData = z.infer<typeof signupSchema>;
export type LoginFormData = z.infer<typeof loginSchema>;
