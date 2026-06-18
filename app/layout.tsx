import "./globals.css";

export const metadata = {
  title: "Scanner Debugger",
  description: "Tool for debugging card scanner visually.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
