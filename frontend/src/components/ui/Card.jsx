export default function Card({ children, className = '' }) {
  return <section className={`card p-4 sm:p-5 ${className}`}>{children}</section>;
}
