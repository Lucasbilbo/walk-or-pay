export default function SupportPage() {
  return (
    <div style={s.outer}>
      <div style={s.container}>
        <a href="/" style={s.back}>← Back to Walk or Pay</a>

        <h1 style={s.title}>Walk or Pay Support</h1>
        <p style={s.subtitle}>
          Need help? Email us at{' '}
          <a href="mailto:hello@walkorpay.com" style={s.link}>hello@walkorpay.com</a>
        </p>

        <h2 style={s.h2}>Frequently Asked Questions</h2>

        <div style={s.faq}>
          <h3 style={s.question}>How does the deposit work?</h3>
          <p style={s.answer}>
            Your money is always yours. At the end of the 7-day challenge, you receive it back
            proportionally for the days you hit your goal. Unrefunded amounts are donated to charity.
          </p>
        </div>

        <div style={s.faq}>
          <h3 style={s.question}>What happens if Google Fit / Apple Health data is wrong?</h3>
          <p style={s.answer}>
            Contact us at{' '}
            <a href="mailto:hello@walkorpay.com" style={s.link}>hello@walkorpay.com</a>{' '}
            and we will manually review your case.
          </p>
        </div>

        <div style={s.faq}>
          <h3 style={s.question}>How do I delete my account?</h3>
          <p style={s.answer}>
            Go to Profile → Delete Account in the app.
          </p>
        </div>
      </div>
    </div>
  )
}

const s = {
  outer: { minHeight: '100vh', background: 'var(--color-bg)', padding: '40px 24px' },
  container: { maxWidth: 680, margin: '0 auto' },
  back: { display: 'inline-block', fontSize: 13, color: 'var(--color-primary)', textDecoration: 'none', marginBottom: 32 },
  title: { fontSize: 24, fontWeight: 700, marginBottom: 10 },
  subtitle: { fontSize: 15, color: 'var(--color-text-secondary)', lineHeight: 1.7, marginBottom: 40 },
  h2: { fontSize: 16, fontWeight: 600, marginBottom: 20 },
  faq: { marginBottom: 28, paddingBottom: 28, borderBottom: '1px solid var(--color-border)' },
  question: { fontSize: 15, fontWeight: 600, marginBottom: 8 },
  answer: { fontSize: 15, color: 'var(--color-text-secondary)', lineHeight: 1.7, margin: 0 },
  link: { color: 'var(--color-primary)' },
}
