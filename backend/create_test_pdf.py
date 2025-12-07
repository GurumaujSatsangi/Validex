"""
Create a test PDF with provider information for testing the PDF OCR feature.
Requirements: pip install reportlab
"""
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch

# Create PDF
pdf_file = "test_providers.pdf"
doc = SimpleDocTemplate(pdf_file, pagesize=letter)
story = []
styles = getSampleStyleSheet()

# Custom style for headers
title_style = ParagraphStyle(
    'CustomTitle',
    parent=styles['Heading1'],
    fontSize=16,
    textColor='#000000',
    spaceAfter=12
)

# Add title
story.append(Paragraph("Provider Directory", title_style))
story.append(Spacer(1, 0.3*inch))

# Sample provider data
providers = [
    {
        'name': 'Dr. John Smith',
        'npi': 'NPI: 1234567890',
        'phone': 'Phone: (555) 123-4567',
        'address': '123 Main Street',
        'city': 'New York, NY 10001',
        'specialty': 'Cardiologist'
    },
    {
        'name': 'Dr. Jane Doe',
        'npi': 'NPI: 0987654321',
        'phone': 'Phone: (555) 987-6543',
        'address': '456 Oak Avenue',
        'city': 'Los Angeles, CA 90001',
        'specialty': 'Physician'
    },
    {
        'name': 'Dr. Michael Johnson',
        'npi': 'NPI: 1111111111',
        'phone': 'Phone: (555) 111-2222',
        'address': '789 Elm Street',
        'city': 'Chicago, IL 60601',
        'specialty': 'Dentist'
    },
    {
        'name': 'Dr. Sarah Williams',
        'npi': 'NPI: 2222222222',
        'phone': 'Phone: (555) 222-3333',
        'address': '321 Pine Road',
        'city': 'Houston, TX 77001',
        'specialty': 'Surgeon'
    }
]

# Add providers to PDF
for i, provider in enumerate(providers, 1):
    story.append(Paragraph(f"{i}. {provider['name']}", styles['Heading2']))
    story.append(Spacer(1, 0.1*inch))
    story.append(Paragraph(provider['npi'], styles['Normal']))
    story.append(Paragraph(provider['phone'], styles['Normal']))
    story.append(Paragraph(provider['address'], styles['Normal']))
    story.append(Paragraph(provider['city'], styles['Normal']))
    story.append(Paragraph(f"<b>Specialty:</b> {provider['specialty']}", styles['Normal']))
    story.append(Spacer(1, 0.2*inch))

# Build PDF
doc.build(story)
print(f"✓ Test PDF created: {pdf_file}")
print(f"  Contains {len(providers)} sample providers")
print("  Upload this file to test the PDF OCR feature")
