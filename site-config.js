// PopOutPick central text and typography controls
// Edit this file to change website wording, symbols, font family, and font sizes.
window.POPOUTPICK_CONFIG = {
    contact: {
        telegramUrl: "https://t.me/aroyston"
    },

    fonts: {
        family: "'Helvetica Neue', Helvetica, Arial, sans-serif"
    },

    typography: {
        base: "18px",
        body: "1.05rem",
        small: "0.95rem",
        pageTitle: "2.4rem",
        sectionTitle: "2.2rem",
        subtitle: "1.25rem",
        cardTitle: "2.2rem",
        cardMeta: "1.05rem",
        stepCircle: "1.05rem",
        stepLabel: "0.85rem",
        labelCaps: "0.9rem",
        navButton: "1.1rem",
        footerIndicator: "1.05rem",
        assemblyStatus: "1.2rem",
        controlButton: "1.55rem",
        slotAddIcon: "2.4rem",
        slotBadge: "0.9rem",
        slotActiveCheck: "1rem",
        slotMusicNote: "1.8rem",
        pickholderNumber: "1.05rem",
        pickholderTitle: "1.25rem",
        pickholderHelper: "1rem",
        thicknessButton: "1.1rem",
        summaryIcon: "1.45rem",
        errorBanner: "14px"
    },

    commerce: {
        currencySymbol: "$",
        productBasePrice: 10,
        shopProducts: [
            {
                id: "custom-pick-holder",
                name: "Custom Pick Holder",
                description: "Replacement pick holder module",
                price: 1,
                previewPart: "module",
                previewZoom: 1.6,
                icon: "",
                symbol: "♪"
            },
            {
                id: "slider",
                name: "Slider",
                description: "Replacement slider for both Guitar and Bass PopOutPick sets",
                price: 1,
                previewPart: "slider",
                previewZoom: 1.5,
                icon: "",
                symbol: "↔"
            },
            {
                id: "top-plate",
                name: "Top Plate",
                description: "Replacement top plate",
                price: 1,
                previewPart: "top",
                previewRotation: [1.35, 0, 0],
                previewZoom: 1.35,
                icon: "",
                symbol: "▲"
            },
            {
                id: "base-plate",
                name: "Base Plate",
                description: "Replacement base plate",
                price: 1,
                previewPart: "bottom",
                previewRotation: [1.35, 0, 0],
                previewZoom: 1.35,
                icon: "",
                symbol: "▼"
            }
        ].concat([
            {
                id: "guitar-pick-holder",
                name: "Guitar Pick Holder",
                description: "Replacement guitar pick holder. Choose size and colours after clicking.",
                price: 1,
                previewType: "guitar",
                previewPart: "holder:10mm",
                shopPartType: "holder",
                previewZoom: 1.55,
                icon: "",
                symbol: "#"
            },
            {
                id: "bass-pick-holder",
                name: "Bass Pick Holder",
                description: "Replacement bass pick holder. Choose size and colours after clicking.",
                price: 1,
                previewType: "bass",
                previewPart: "holder:30mm",
                shopPartType: "holder",
                previewZoom: 1.55,
                icon: "",
                symbol: "#"
            }
        ]),
        designAddOns: {
            slider: { label: "Add a 2D design for $2", price: 2, type: "2D" },
            top: { label: "Add a 3D design for $3", price: 3, type: "3D" },
            top2d: { label: "Add a 2D design for $2", price: 2, type: "2D", partKey: "top" },
            bottom: { label: "Add a 2D design for $2", price: 2, type: "2D" }
        },
        promoCodes: [],
        enableCheckoutTestButton: false,
        quietOptionalSupabaseWarnings: true,
        checkoutApiUrl: "https://jllzhecqlxzegnrqhxnc.supabase.co/functions/v1/checkout-order",
        meetupShippingPrice: 0,
        deliveryShippingPrice: 2.6,
        supabase: {
            url: "https://jllzhecqlxzegnrqhxnc.supabase.co",
            anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpsbHpoZWNxbHh6ZWducnFoeG5jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3ODg5MDYsImV4cCI6MjA5NzM2NDkwNn0.sOe54qCGAR3OmIVWzT_itD-5Ttjgx8HngJLBJ7u4E38",
            ordersTable: "orders",
            orderFilesTable: "order_files"
        },
        timeSlots: ["10:00 AM", "11:00 AM", "12:00 PM", "1:00 PM", "2:00 PM", "3:00 PM", "4:00 PM", "5:00 PM", "6:00 PM", "7:00 PM", "8:00 PM"],
        meetupLocations: [
            { id: "pasir-ris", name: "Pasir Ris Mall", sub: "East Singapore" },
            { id: "ntu", name: "NTU", sub: "Nanyang Technological University" }
        ]
    },

    text: {
        documentTitle: "PopOutPick - Official Master Configurator",

        step1: {
            title: "Choose Your Pick Type",
            subtitle: "Are you a guitar player or a bass player?",
            guitarTitle: "Guitar",
            guitarRange: "10MM - 6MM",
            guitarAlt: "Guitar Icon",
            bassTitle: "Bass",
            bassRange: "30MM - 6MM",
            bassAlt: "Bass Icon"
        },

        pickholders: {
            title: "Pickholders",
            subtitle: "Choose 4 pickholders — click each slot to configure its thickness and color",
            completeMessage: "✓ All 4 pickholders configured",
            itemTitle: "Pickholder {number}",
            helper: "Configure the thickness and color for this slot",
            thicknessLabel: "THICKNESS",
            bodyColorLabel: "COLOUR OF BODY",
            numberColorLabel: "COLOR OF NUMBER"
        },

        normalSteps: {
            titles: ["", "Body", "Pickholders", "Module", "Slider", "Top Plate", "Bottom Plate"],
            colorLabel: "COLOR",
            customDesignLabel: "CUSTOM DESIGN IMAGE",
            designColorLabel: "DESIGN COLOUR",
            uploadText: "Click to upload",
            previewLabel: "2D PREVIEW",
            previewEmptyText: "Upload a custom design below to preview it here",
            previewAlt: "Uploaded custom design preview",
            designSizeLabel: "DESIGN SIZE",
            designMoveHelp: "Drag the uploaded design around the 2D preview",
            designDropText: "Click or drop an image here",
            removeDesign: "Remove design",
            designAddedLabel: "{type} design added",
            designFileLabel: "File",
            currentDesignFallback: "current design",
            uploadReadingText: "Reading new file: {name}",
            uploadReplacingMeta: "Preparing to replace {previous}",
            uploadReplacingText: "Replacing {previous} with {name}",
            uploadCompleteText: "{name} is now active in this design",
            uploadCompleteMeta: "Previous in-memory file: {previous}",
            uploadErrorText: "Could not load {name}",
            uploadErrorMeta: "The previous file is still active."
        },

        finalReview: {
            title: "Your Custom PopOutPick",
            subtitle: "Review your design before finishing",
            assemblyStatus: "Assembling your PopOutPick...",
            assemblyStatusWithProgress: "Assembling your PopOutPick... {progress}%",
            finalModelPathNote: "GLB preview model paths are set in script.js as glbModels",
            partsBreakdown: "PARTS BREAKDOWN",
            colorLabel: "Color",
            bodyColorLabel: "Body color",
            numberColorLabel: "Number color",
            thicknessLabel: "Thickness"
        },

        checkout: {
            title: "Checkout",
            subtitle: "Complete your PopOutPick order.",
            flowLabels: ["Cart", "Details", "Payment"],
            cartTitle: "Shopping Cart",
            productHeader: "Product",
            quantityHeader: "Quantity",
            totalHeader: "Total Price",
            editDesign: "Edit design",
            continueToDetails: "Continue to Details →",
            continueToPayment: "Continue to Payment →",
            fulfilmentTitle: "Fulfilment",
            fulfilmentPrompt: "How would you like to receive your order?",
            fulfilmentDetailsTitle: "Fulfilment Details",
            meetupLabel: "Meet-up",
            deliveryLabel: "Delivery",
            deliveryPriceLabel: "+$2.60",
            detailsMeetupTitle: "Meet-up Details",
            detailsDeliveryTitle: "Delivery Details",
            contactSectionLabel: "Contact details",
            nameLabel: "Full name",
            emailLabel: "Email",
            phoneLabel: "Phone number",
            telegramLabel: "Telegram @",
            dateLabel: "Pick a date",
            timeLabel: "Pick a time",
            locationLabel: "Choose location",
            deliverySectionLabel: "Delivery address",
            postalLabel: "Postal Code",
            streetLabel: "Street Name",
            blockLabel: "Block No.",
            floorLabel: "Floor No.",
            unitLabel: "Unit No.",
            buildingLabel: "Building Name",
            notesLabel: "Others / Notes",
            orderSummaryTitle: "Your Order",
            paymentTitle: "Order Summary",
            payNowTitle: "Pay via PayNow",
            payNowSubtitle: "Scan with your bank app to complete payment.",
            qrTransferTo: "Transfer to: PopOutPick",
            paymentScreenshotLabel: "Upload Payment's Screen Shot",
            paymentScreenshotHelp: "Attach your bank payment confirmation screenshot.",
            confirmButton: "I’ve Paid — Confirm Order",
            confirmSavingButton: "Saving order...",
            testSupabaseButton: "Send test order to Supabase",
            subtotalLabel: "Subtotal",
            shippingLabel: "Shipping",
            discountLabel: "Discount",
            totalLabel: "Total",
            freeShippingLabel: "Free",
            shopAddedToCartMessage: "Item has been added to cart",
            shopAddedToCartOk: "OK",
            promoCodeLabel: "Promo code",
            promoCodePlaceholder: "Enter code",
            promoCodeHelp: "Discounts update automatically before you pay.",
            promoCheckingMessage: "Checking promo code...",
            promoAppliedMessage: "{label} applied.",
            promoInvalidMessage: "{code} is not a valid promo code.",
            requiredContactMessage: "Please enter your name, email, phone number, and Telegram @.",
            requiredMeetupMessage: "Please select a date, time, and location to continue.",
            requiredDeliveryMessage: "Please complete the required delivery fields.",
            backToCart: "‹ Back to Cart",
            backToDetails: "‹ Back to Details",
            successTitle: "Order confirmed",
            successMessage: "Thank you. Save your order ID. We will verify your payment screenshot and contact you to confirm the next step.",
            successKicker: "Order received",
            successOrderIdLabel: "Order ID",
            successStepPayment: "We verify your PayNow screenshot.",
            successStepConfirm: "We contact you if any design or meetup detail needs confirmation.",
            successStepPrepare: "Your PopOutPick is prepared for the selected meetup or delivery option.",
            checkoutTrustTitle: "Good to know",
            checkoutTrustLeadTime: "Orders open from 7 days ahead so there is time to prepare your design.",
            checkoutTrustPayment: "Payment proof is uploaded privately with your order.",
            checkoutTrustCards: {
                cart: [
                    { label: "Production", value: "Custom orders need at least 7 days before meetup or delivery." },
                    { label: "Payment", value: "PayNow confirmation is checked before the order is prepared." },
                    { label: "Contact", value: "We use your contact details only for this order." }
                ],
                details: [
                    { label: "Meetup or delivery", value: "Choose a valid date, time, and location before payment." },
                    { label: "Order updates", value: "We will contact you using your email, phone, or Telegram handle." },
                    { label: "Privacy", value: "Only the details needed to complete your order are collected." }
                ],
                payment: [
                    { label: "Before confirming", value: "Pay the exact total shown and upload your bank screenshot." },
                    { label: "After confirming", value: "Your order is saved and we will verify payment before making it." },
                    { label: "Keep your ID", value: "Save the order ID shown after confirmation." }
                ]
            },
            missingSupabaseMessage: "Supabase is not configured yet.",
            supabaseTestSuccess: "Test order saved in Supabase.",
            supabaseTestError: "Supabase test failed. Check your project URL, anon key, and RLS policies.",
            orderSubmissionError: "Order submission failed. Please try again or contact us with your order details."
        },

        timeline: {
            labels: ["Type", "Body", "Pickholders", "Module", "Slider", "Top Plate", "Bottom Plate", "Final Review"],
            finalReview: "FINAL REVIEW",
            stepIndicator: "STEP {current} OF {total}"
        },

        nav: {
            previous: "← Previous",
            next: "Next →"
        },

        summary: {
            body: "Body",
            pickholders: "Pickholders",
            module: "Module",
            slider: "Slider",
            top: "Top Plate",
            bottom: "Bottom Plate"
        },

        symbols: {
            configured: "✓",
            add: "+",
            musicNote: "♩",
            edit: "✎",
            rotate: "🔄",
            upload: "☁️"
        },

        error: {
            prefix: "Configurator Error:",
            lineLabel: "Line",
            inLabel: "in"
        }
    }
};
