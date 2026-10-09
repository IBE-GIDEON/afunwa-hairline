import { type Metadata } from "next"

import { LegalPage } from "@/components/legal-page"

export const metadata: Metadata = {
  title: "Privacy Policy"
}

export default function PrivacyPolicyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      lastUpdated="October 2026"
      intro="Afunwa Hairline Global respects your privacy. This policy explains what information we collect, why we collect it, how we use it and the choices you have."
      sections={[
        {
          heading: "Information we collect",
          body: [
            "We may collect your full name, phone number, email address, delivery address, billing details where needed, order details, and anything you send when you contact customer service.",
            "Payments are processed by Paystack. We do not ask for full card details through WhatsApp, email, social media or other informal channels. Payment providers handle payment data under their own privacy policies and the law."
          ]
        },
        {
          heading: "How we collect it",
          body: [
            "We collect information when you visit or use the website, create or submit an order, make a payment, contact us, ask about products, or message us on WhatsApp, social media or email."
          ]
        },
        {
          heading: "How we use it",
          body: [
            "We use your information to process and deliver orders, confirm payments, arrange delivery, contact you about your order, answer customer service questions, send information about products you asked about, handle returns, refunds and complaints, prevent fraud, keep business and transaction records, improve our products and website, and meet legal obligations. We respect consent and opt-out rules for any promotional messages."
          ]
        },
        {
          heading: "Sharing your information",
          body: [
            "We do not sell or rent your personal information. We share only what is needed with trusted providers, such as payment processors, delivery companies, technology providers and professional advisers. We may also share information with government, regulators or law enforcement when the law requires it."
          ]
        },
        {
          heading: "Payment processing",
          body: [
            "Paystack may use transaction and personal information to process payments, prevent fraud, handle refunds and meet legal requirements. You can read Paystack's privacy information on its website."
          ]
        },
        {
          heading: "Data security",
          body: [
            "We take reasonable steps to protect your information from unauthorised access, loss, misuse, alteration or disclosure. No online system is completely secure, so please also protect your own accounts, devices and passwords."
          ]
        },
        {
          heading: "How long we keep it",
          body: [
            "We keep personal information only as long as it is needed for the purpose it was collected, such as fulfilling orders, keeping records, resolving disputes, preventing fraud and meeting legal requirements. After that, we delete, anonymise or securely dispose of it where appropriate."
          ]
        },
        {
          heading: "Your rights",
          body: [
            "Subject to the law, you can ask what we do with your information, ask for a copy of what we hold, ask us to correct inaccurate details, ask us to delete it where the law allows, object to certain uses, withdraw consent where we rely on it, and ask us to restrict some processing. Some information must be kept where the law requires it."
          ]
        },
        {
          heading: "Cookies",
          body: [
            "The website may use cookies or similar tools to make it work, understand how it is used, improve performance and give a better experience. Where required, we will give you information and choices about them."
          ]
        },
        {
          heading: "Third-party websites",
          body: [
            "Our site may link to other platforms. We are not responsible for their privacy practices, so check their policies before you share information with them."
          ]
        },
        {
          heading: "Children",
          body: [
            "We do not knowingly collect personal information from children without proper consent or a legal basis. If you think a child has given us information improperly, contact us and we will look into it."
          ]
        },
        {
          heading: "Changes to this policy",
          body: [
            "We may update this policy as our business, services, technology or the law changes. The updated version will be posted here with a new Last Updated date."
          ]
        },
        {
          heading: "Contact us",
          body: [
            "For privacy questions or requests, contact Afunwa Hairline Global:",
            "Phone or WhatsApp: +234 9157428733",
            "Email: piddie846@gmail.com",
            "Address: 10 Alagbade Street, off Breadfruit, Balogun Market, Lagos Island",
            "We will respond within a reasonable time and in line with the law."
          ]
        }
      ]}
    />
  )
}
