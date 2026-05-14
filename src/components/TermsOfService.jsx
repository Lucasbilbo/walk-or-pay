export default function TermsOfService() {
  return (
    <div style={s.outer}>
      <div style={s.container}>
        <a href="/" style={s.back}>← Back to Walk or Pay</a>

        <h1 style={s.title}>Terms of Service</h1>
        <p style={s.updated}>Last updated: May 2025</p>

        <h2 style={s.h2}>What is Walk or Pay?</h2>
        <p style={s.p}>Walk or Pay is a charitable commitment service. You choose a charity, set a daily step goal, and make an upfront donation. Complete your goal every day and receive a full refund. Miss days and your donation stays with your chosen charity.</p>

        <div style={s.highlight}>
          <p style={{ ...s.p, marginBottom: 0 }}>Walk or Pay is <strong>not gambling</strong>. The outcome depends entirely on your own behaviour. There are no bets against other participants.</p>
        </div>

        <h2 style={s.h2}>Your donation</h2>
        <p style={s.p}>Your donation goes to your chosen charity from day one. If you complete your step goal every day during the 7-day challenge, you receive a full refund. If you miss days, the corresponding portion of your donation remains with the charity. The refund is calculated as:</p>
        <p style={{ ...s.p, fontFamily: 'monospace', background: 'var(--color-bg-secondary, #f5f5f5)', padding: '8px 12px', borderRadius: 6 }}>
          refund = ((7 - missed_days) / 7) × donation
        </p>
        <p style={s.p}>Missed days are days where your recorded steps did not reach your goal and no grace day was applied.</p>

        <h2 style={s.h2}>Where your donation goes</h2>
        <p style={s.p}>Your donation goes to the charity you selected when creating your challenge. Walk or Pay never retains donated funds as profit.</p>

        <h2 style={s.h2}>This is not gambling</h2>
        <p style={s.p}>Walk or Pay is a commitment deposit mechanism. The result depends solely on whether you meet your step goal — a measurable physical activity you control. It is not subject to chance.</p>

        <h2 style={s.h2}>Payments</h2>
        <p style={s.p}>Payments are processed by <a href="https://stripe.com/legal" target="_blank" rel="noreferrer" style={s.link}>Stripe</a> and are subject to their terms. Walk or Pay does not store card details.</p>

        <h2 style={s.h2}>Eligibility</h2>
        <p style={s.p}>You must be 18 years of age or older to use Walk or Pay.</p>

        <h2 style={s.h2}>Data integrity</h2>
        <p style={s.p}>We reserve the right to close a challenge and forfeit the refund eligibility if we detect manipulation of step data or any attempt to circumvent the challenge rules.</p>

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
  highlight: {
    background: 'rgba(83,74,183,0.06)',
    borderLeft: '3px solid var(--color-primary)',
    padding: '12px 16px',
    borderRadius: '0 6px 6px 0',
    margin: '16px 0',
  },
  link: { color: 'var(--color-primary)' },
}
