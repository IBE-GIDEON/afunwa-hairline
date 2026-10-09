import { type Metadata } from "next"

import { LegalPage } from "@/components/legal-page"

export const metadata: Metadata = {
  title: "Refund and Return Policy"
}

export default function RefundPolicyPage() {
  return (
    <LegalPage
      title="Refund and Return Policy"
      lastUpdated="October 2026"
      intro="We want every customer to receive what they ordered in good condition. This policy explains when a return or refund can be accepted and how to ask for one."
      sections={[
        {
          heading: "When a return is considered",
          body: [
            "We consider a return if you received the wrong product, the product is materially different from what you ordered, the product arrived damaged or defective, or there is another confirmed problem caused by us. Contact us promptly if you think something is wrong."
          ]
        },
        {
          heading: "Time limit",
          body: [
            "Contact us within 48 hours of receiving your order to report a return or product issue. Requests after that may not be accepted, unless the circumstances require otherwise."
          ]
        },
        {
          heading: "Condition required",
          body: [
            "To qualify, a product must generally be unused, unworn, unaltered and in its original condition, free from damage you caused, and returned with the order information.",
            "For wigs and hair products, do not install, cut, bleach, colour, wash, chemically treat, glue, sew or style the product before you ask for a return. Altered or used products may not qualify unless the problem existed before you used them."
          ]
        },
        {
          heading: "Not returnable",
          body: [
            "Returns are generally not accepted if you changed your mind after buying, the product has been worn, installed, cut, bleached, dyed, washed or chemically treated, you damaged it, you gave wrong measurements, specifications or delivery details, or the product was bought in a clearly stated final sale or non-returnable promotion. Some hygiene-sensitive products cannot be returned once opened or used."
          ]
        },
        {
          heading: "Wrong item received",
          body: [
            "If we send the wrong item, contact us as soon as possible. We may ask for photos or videos of the product you received, the packaging, the order details and any labels or tags. Once we have reviewed it, we will decide the right solution. If the mistake was ours, we may arrange a replacement, a return or a refund."
          ]
        },
        {
          heading: "Damaged or defective products",
          body: [
            "If your product arrives damaged or has a manufacturing defect, contact us promptly with clear photos or videos where needed. Damage caused after delivery by poor handling, installation, styling, washing, chemical treatment or other use will not qualify for a refund or replacement."
          ]
        },
        {
          heading: "Refunds",
          body: [
            "Approved refunds are normally paid back through the original payment method or the refund process for that transaction. How long the money takes to reach your account depends on your payment provider or bank. We may not process a refund until any returned product has been received and checked."
          ]
        },
        {
          heading: "Delivery charges",
          body: [
            "Delivery charges are non-refundable unless the return or refund was caused by a mistake on our side. If you return a product for reasons that are not our fault, you may have to pay the return delivery cost."
          ]
        },
        {
          heading: "Payment charges",
          body: [
            "Payment processing charges may not be recoverable when a transaction is refunded. Refund amounts are worked out under this policy, the original transaction and the requirements of the payment provider."
          ]
        },
        {
          heading: "Exchanges",
          body: [
            "Where possible and if stock allows, we may offer an exchange instead of a refund. An exchange is only approved after we have checked the returned product and confirmed it meets the conditions above."
          ]
        },
        {
          heading: "Promotions",
          body: [
            "Products bought in promotions, clearance sales or other special offers may have their own return or refund conditions. We will tell you about any special conditions when you buy."
          ]
        },
        {
          heading: "How to request a refund or return",
          body: [
            "Contact us on WhatsApp or phone at +234 9157428733 with your full name, order number, the phone number used for the order, the product you bought, the reason for the request, and clear photos or videos where relevant. We will review it and tell you the next steps."
          ]
        },
        {
          heading: "Unauthorised transactions",
          body: [
            "If you think someone made a payment using your payment method without your permission, contact us immediately. We may investigate and ask for information to verify the order. You may also need to contact your bank or payment provider."
          ]
        },
        {
          heading: "Changes to this policy",
          body: [
            "We may update this policy when needed. The latest version will always be on this website."
          ]
        },
        {
          heading: "Contact us",
          body: [
            "For questions about returns or refunds, contact Afunwa Hairline Global:",
            "Phone or WhatsApp: +234 9157428733",
            "Email: piddie846@gmail.com",
            "Address: 10 Alagbade Street, off Breadfruit, Balogun Market, Lagos Island",
            "We handle genuine return and refund requests fairly, in line with the law and our published policies."
          ]
        }
      ]}
    />
  )
}
