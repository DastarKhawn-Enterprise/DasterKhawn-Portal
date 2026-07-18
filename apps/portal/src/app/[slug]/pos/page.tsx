import { redirect } from 'next/navigation';

export default function POSRoot({ params }: { params: { slug: string } }) {
  redirect(`/${params.slug}/pos/dashboard`);
}
