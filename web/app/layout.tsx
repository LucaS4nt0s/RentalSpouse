import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'RentalSpouse',
  description: 'Plataforma RentalSpouse - Marido de Aluguel',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
