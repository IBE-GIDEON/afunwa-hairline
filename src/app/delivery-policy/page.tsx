import { type Metadata } from "next"

import { LegalPage } from "@/components/legal-page"

export const metadata: Metadata = {
  title: "Delivery Policy"
}

export default function DeliveryPolicyPage() {
  return (
    <LegalPage
      title="Delivery Policy"
      lastUpdated="October 2026"
      intro="This policy explains how orders are processed and delivered once payment has been confirmed."
      sections={[
        {
          heading: "Order processing",
          body: [
            "We process orders once payment is confirmed. Processing time depends on stock, order size, product type, any customisation or preparation, and your location. We may contact you first if we need more information."
          ]
        },
        {
          heading: "Where we deliver",
          body: [
            "We deliver across Nigeria and to selected international destinations where available. International availability depends on the destination, the courier, customs rules and other restrictions. If you are ordering from abroad and want to know whether we deliver to you, contact us before you pay."
          ]
        },
        {
          heading: "Delivery time",
          body: [
            "A typical delivery takes 3 to 5 working days from the day your order is confirmed and processed. These are estimates, not guaranteed dates. Delays can happen because of public holidays, weather, traffic, courier problems, incorrect delivery details, customs or border checks on international orders, or other unexpected events."
          ]
        },
        {
          heading: "Delivery charges",
          body: [
            "Delivery charges depend on your location, the package size or weight, the delivery method, the courier and, for international orders, the destination. We will tell you the charge before you complete your order. Delivery charges are separate from the product price unless we say otherwise."
          ]
        },
        {
          heading: "Your delivery details",
          body: [
            "Make sure your full name, active phone number, complete delivery address and location details are correct. We are not responsible for delays or failed deliveries caused by wrong or outdated details."
          ]
        },
        {
          heading: "Failed deliveries",
          body: [
            "If a delivery fails because you were unavailable, gave wrong details, refused the package or could not be reached, extra delivery arrangements or charges may apply. Please stay reachable on your phone during the expected delivery period."
          ]
        },
        {
          heading: "Inspecting your order",
          body: [
            "Check your order when it arrives. If you receive the wrong product, a visibly damaged package or something very different from what you ordered, contact us as soon as possible. Clear photos or videos help us resolve it quickly."
          ]
        },
        {
          heading: "Missing or damaged orders",
          body: [
            "If your order is missing, damaged or delivered to the wrong place, contact us promptly. We may ask for your order number, name, phone number, delivery details, photos or videos of the package, and anything else we need to investigate. If a courier handled the delivery, we may also need to contact them."
          ]
        },
        {
          heading: "International deliveries",
          body: [
            "International orders may attract extra charges depending on the destination. Unless we agree otherwise, you may have to pay customs duties, import charges, taxes or other fees set by the destination country. Customs clearance can also make delivery take longer."
          ]
        },
        {
          heading: "Delivery and refunds",
          body: [
            "A failed or missing delivery does not automatically qualify for a refund. Refund requests are assessed under our Refund and Return Policy. If an order is sent back because of wrong customer details, refusal to accept it or repeated failed attempts, extra delivery costs may apply before we resend it."
          ]
        },
        {
          heading: "Contact us",
          body: [
            "For delivery questions, contact Afunwa Hairline Global:",
            "Phone or WhatsApp: +234 9157428733",
            "Email: piddie846@gmail.com",
            "Address: 10 Alagbade Street, off Breadfruit, Balogun Market, Lagos Island",
            "When you contact us about an order, include your order number or the phone number you used to place it."
          ]
        }
      ]}
    />
  )
}
