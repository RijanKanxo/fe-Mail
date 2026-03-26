export default function TermsOfService() {
  return (
    <div style={{
      maxWidth: "680px", margin: "0 auto", padding: "60px 24px",
      fontFamily: "'DM Sans', sans-serif", color: "#1e1a14", lineHeight: "1.7"
    }}>
      <h1 style={{ fontFamily: "Georgia, serif", fontStyle: "italic", fontSize: "36px", fontWeight: 400, marginBottom: "8px" }}>
        Terms of Service
      </h1>
      <p style={{ color: "#6b6357", fontSize: "14px", marginBottom: "40px" }}>
        Last updated: {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
      </p>

      <Section title="Acceptance">
        By using fe-Mail, you agree to these terms. If you do not agree, please do not use the app.
      </Section>

      <Section title="What fe-Mail is">
        fe-Mail is a personal email client that connects to your existing Gmail account.
        It is not an email provider — it simply provides an interface to read and send
        emails through your existing Google account.
      </Section>

      <Section title="Your account">
        You are responsible for maintaining the security of your Google account. fe-Mail
        accesses your Gmail through Google's official OAuth system. You can revoke fe-Mail's
        access at any time through your{" "}
        <a href="https://myaccount.google.com/permissions" style={{ color: "#3d5a99" }}>
          Google account permissions
        </a>.
      </Section>

      <Section title="Acceptable use">
        You agree not to use fe-Mail to:
        <ul style={{ marginTop: "10px", paddingLeft: "20px" }}>
          <li>Send spam or unsolicited emails</li>
          <li>Violate any applicable laws or regulations</li>
          <li>Attempt to gain unauthorized access to any system</li>
          <li>Interfere with the operation of the service</li>
        </ul>
      </Section>

      <Section title="Availability">
        fe-Mail is provided as-is. We do not guarantee uninterrupted or error-free service.
        We may update, pause, or discontinue the service at any time without notice.
      </Section>

      <Section title="Limitation of liability">
        fe-Mail is not liable for any loss of data, emails, or damages resulting from use
        of the service. Use fe-Mail at your own risk.
      </Section>

      <Section title="Changes">
        We may update these terms at any time. Continued use of fe-Mail after changes
        constitutes acceptance of the new terms.
      </Section>

      <Section title="Contact">
        Questions about these terms?{" "}
        <a href="mailto:ctit25.rkp@ismt.edu.np" style={{ color: "#3d5a99" }}>
          ctit25.rkp@ismt.edu.np
        </a>
      </Section>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: "32px" }}>
      <h2 style={{ fontSize: "16px", fontWeight: "600", marginBottom: "8px", color: "#1e1a14" }}>
        {title}
      </h2>
      <div style={{ fontSize: "15px", color: "#4a4540" }}>{children}</div>
    </div>
  )
}
