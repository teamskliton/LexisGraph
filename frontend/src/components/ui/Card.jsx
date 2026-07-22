export default function Card({ children, className = '' }) {
  return <section className={`card p-5 ${className}`}>{children}</section>;
}
