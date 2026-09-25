import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PublicPayment } from '../../../consumer/PublicPayment';
export const metadata: Metadata = { title: 'Perfil público — GatoPago', robots: { index: false, follow: false }, referrer: 'no-referrer' };
export const dynamic = 'force-dynamic';
export default async function Page({ params, searchParams }: { params: Promise<{ username: string }>; searchParams: Promise<{ lang?: string }> }) {
  const [{ username }, { lang }] = await Promise.all([params, searchParams]);
  let handle: string;
  try { handle = decodeURIComponent(username); } catch { notFound(); }
  // Retain /username links as well as /@username, without asserting existence.
  if (!/^@?[a-zA-Z0-9_-]{1,30}$/.test(handle)) notFound();
  return <PublicPayment key={handle} kind="profile" reference={handle} english={lang === 'en'} />;
}
