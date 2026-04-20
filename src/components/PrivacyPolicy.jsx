export default function PrivacyPolicy() {
  return (
    <div style={s.outer}>
      <div style={s.container}>
        <a href="/" style={s.back}>← Back to Walk or Pay</a>

        <h1 style={s.title}>Privacy Policy</h1>
        <p style={s.updated}>Last updated: April 2025</p>

        <h2 style={s.h2}>What we collect</h2>
        <ul style={s.ul}>
          <li><strong>Email address</strong> — to identify your account and send challenge-related communications.</li>
          <li><strong>Daily step data</strong> — read from Apple Health (iOS) or Google Fit (Android) to verify your daily challenge progress.</li>
          <li><strong>Payment data</strong> — processed entirely by Stripe. We do not store card numbers or payment details.</li>
        </ul>

        <h2 style={s.h2}>Why we collect it</h2>
        <p style={s.p}>We use your data exclusively to manage your challenge and process payments. We do not use it for advertising or sell it to third parties.</p>

        <h2 style={s.h2}>Apple Health &amp; Google Fit</h2>
        <p style={s.p}>Step data read from Apple Health or Google Fit is used only to verify your daily goal. This data is <strong>never shared with third parties</strong> and is not used for any purpose beyond your challenge.</p>

        <h2 style={s.h2}>Payments</h2>
        <p style={s.p}>Payments are handled by <a href="https://stripe.com/privacy" target="_blank" rel="noreferrer" style={s.link}>Stripe</a>. Walk or Pay only stores the internal payment identifier. For details on how Stripe processes your payment data, see their privacy policy.</p>

        <h2 style={s.h2}>Your rights (GDPR)</h2>
        <p style={s.p}>You have the right to access, rectify, and delete your personal data. To exercise any of these rights, email us at <a href="mailto:hello@walkorpay.com" style={s.link}>hello@walkorpay.com</a>. We will respond within 30 days.</p>

        <h2 style={s.h2}>Account deletion</h2>
        <p style={s.p}>You can request deletion of your account and all associated data by emailing <a href="mailto:hello@walkorpay.com" style={s.link}>hello@walkorpay.com</a>.</p>

        <h2 style={s.h2}>Contact</h2>
        <p style={s.p}><a href="mailto:hello@walkorpay.com" style={s.link}>hello@walkorpay.com</a></p>
      </div>
    </div>
  )
}

const s = {
  outer: { minHeight: '100vh', background: 'var(--color-bg)', padding: '40px 24px' },
  container: { maxWidth: 680, margin: '0 auto' },
  back: { display: 'inline-block', fontSize: 13, color: 'var(--color-primary)', textDecoration: 'none', marginBottom: 32 },
  title: { fontSize: 24, fontWeight: 700, marginBottom: 6 },
  updated: { fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 36 },
  h2: { fontSize: 16, fontWeight: 600, marginTop: 32, marginBottom: 10 },
  p: { fontSize: 15, color: 'var(--color-text-secondary)', lineHeight: 1.7, marginBottom: 12 },
  ul: { paddingLeft: 20, marginBottom: 12 },
  link: { color: 'var(--color-primary)' },
}
