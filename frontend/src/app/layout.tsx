import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/lib/auth-context';

export const metadata: Metadata = {
  title: 'EdCap — Early Support & Teacher Capacity Platform',
  description:
    'EdCap helps teachers identify at-risk students early and provides targeted intervention playbooks. Built for SIH1432.',
  keywords: ['EdTech', 'student support', 'learning analytics'],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth" data-theme="dark" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <script
          dangerouslySetInnerHTML={{
            __html: "try{var t=localStorage.getItem('edcap_theme');document.documentElement.dataset.theme=t==='light'?'light':'dark';}catch(e){}",
          }}
        />
      </head>
      <body>
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
