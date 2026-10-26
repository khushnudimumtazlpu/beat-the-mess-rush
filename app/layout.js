import "./globals.css";
import "./landing.css";
import "./student.css";

export const metadata = {
  title: "RushLess — Smart Campus Dining",
  description: "Beat the Mess Rush: Peak-Hour Food Queue and Waste Management.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
