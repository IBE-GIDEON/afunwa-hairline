import { type Metadata } from "next"

import { LegalPage } from "@/components/legal-page"

export const metadata: Metadata = {
  title: "Terms and Conditions"
}

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms and Conditions"
      lastUpdated="October 2026"
      intro="These terms cover your use of the Afunwa Hairline Global website and anything you buy through it. By using the site or placing an order, you agree to them, so please read them before you pay."
      sections={[
        {
          heading: "About us",
          body: [
            "Afunwa Hairline Global sells wigs, hair extensions, bundles, hair products and related accessories. You can browse products, place orders and pay through the methods shown on the website."
          ]
        },
        {
          heading: "Using the website",
          body: [
            "Use the site only for lawful purposes. Do not use it for fraud, try to access parts you are not allowed into, interfere with how it works, give false information when ordering, or pay with someone else's payment details without permission. We may restrict or end access if we reasonably believe these terms have been broken."
          ]
        },
        {
          heading: "Product information",
          body: [
            "We work to keep product descriptions, photos, colours, lengths, textures and prices accurate. Small differences can still happen because of screen settings, photo lighting and the natural variation in human hair. Check the product details carefully before you order."
          ]
        },
        {
          heading: "Prices",
          body: [
            "Prices may change without notice, but a placed and paid order keeps its agreed price. We may correct pricing errors, including products listed at a wrong price by mistake. If a pricing error affects your order, we will contact you before we fulfil it."
          ]
        },
        {
          heading: "Orders",
          body: [
            "Placing an order is a request to buy. It is accepted once payment is confirmed and we have confirmed the order. We may decline or cancel an order if the product is unavailable, we cannot verify the payment, we suspect fraud, your details are wrong or incomplete, or there has been a technical or pricing error. If we cancel after you have paid, you will be refunded under our Refund and Return Policy."
          ]
        },
        {
          heading: "Payment",
          body: [
            "Payments may be made through the methods available on our website, including Paystack. Payment details you enter on the provider's secure page are handled by that provider. We will never ask you to send full card details through WhatsApp, social media, email or any other informal channel. We do not process an order until payment is confirmed."
          ]
        },
        {
          heading: "Delivery",
          body: [
            "We deliver to the address you give at checkout or through our approved order process. You must provide accurate details, including your full name, a correct phone number, a complete delivery address and anything else needed to deliver. Delivery times and charges depend on your location, the delivery service and other factors. See our Delivery Policy for more."
          ]
        },
        {
          heading: "Returns and refunds",
          body: [
            "Returns and refunds follow our Refund and Return Policy, so please read it before you order. Products that have been worn, altered, installed, cut, coloured, bleached, washed, styled or otherwise used are generally not returnable, unless they were defective or wrong when we supplied them."
          ]
        },
        {
          heading: "Changes and cancellations",
          body: [
            "If you need to change or cancel an order, contact us as soon as possible. We will try to help if you ask before the order is processed or dispatched. After that, cancellation may no longer be possible."
          ]
        },
        {
          heading: "Your responsibilities",
          body: [
            "Check your order before you pay. That includes the product type, hair length, quantity, colour or texture where relevant, delivery details and contact details. We are not responsible for losses caused by wrong information from you."
          ]
        },
        {
          heading: "Intellectual property",
          body: [
            "The logos, photos, graphics, product descriptions, videos, text and designs on this site belong to us or are used with permission. Do not copy, change, distribute or use them commercially without our written permission."
          ]
        },
        {
          heading: "Website availability",
          body: [
            "We aim to keep the site running well, but we cannot promise it will always be available or free of errors. We may suspend access for maintenance, updates, security or other reasons beyond our control."
          ]
        },
        {
          heading: "Liability",
          body: [
            "We will take reasonable care to give accurate product information and to fulfil confirmed orders. To the extent the law allows, we are not liable for indirect losses, or for delays caused by couriers, network problems, payment provider issues, natural events or other circumstances outside our control. Nothing in these terms removes any legal right you have that cannot be excluded."
          ]
        },
        {
          heading: "Privacy",
          body: [
            "How we handle your information is set out in our Privacy Policy."
          ]
        },
        {
          heading: "Changes to these terms",
          body: [
            "We may update these terms from time to time. The latest version will always be on this website."
          ]
        },
        {
          heading: "Contact us",
          body: [
            "Afunwa Hairline Global",
            "Phone or WhatsApp: +234 9157428733",
            "Email: piddie846@gmail.com",
            "Address: 10 Alagbade Street, off Breadfruit, Balogun Market, Lagos Island"
          ]
        }
      ]}
    />
  )
}
