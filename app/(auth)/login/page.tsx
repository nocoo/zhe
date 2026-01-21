import { redirect } from 'next/navigation';

/**
 * Login page - redirects to home page which handles login.
 * Kept for backwards compatibility with any existing /login links.
 */
export default function LoginPage() {
  redirect('/');
}
