import type { Metadata } from 'next';
import './globals.css';
import { ThemeProvider } from '../context/ThemeContext';
import { AuthProvider } from '../context/AuthContext';
import { NotificationProvider } from '../context/NotificationContext';

export const metadata: Metadata = {
  title: 'RentalSpouse — Serviços Residenciais',
  description: 'Plataforma RentalSpouse - Conectando proprietários a serviços residenciais de excelência',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className="dark">
      <body className="transition-colors duration-300">
        <ThemeProvider>
          <AuthProvider>
            <NotificationProvider>{children}</NotificationProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

