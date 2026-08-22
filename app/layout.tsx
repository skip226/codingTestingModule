import type { Metadata } from 'next';
import './globals.css';
import './ai-controls.css';
import './workspace.css';
import './lesson-library.css';

export const metadata: Metadata = {
  title: 'TestForge',
  description: 'Turn lesson plans into interactive tests.'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
