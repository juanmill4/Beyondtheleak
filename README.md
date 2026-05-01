# Dark Monitor: Unified OSINT Engine

## Overview
Modern ransomware attacks, classic credential breaches, and infostealer logs have historically existed in isolated silos. While platforms like *Have I Been Pwned* handle structured databases flawlessly, they completely miss the unstructured chaos of ransomware dumps and the deep local artifacts hidden in stealer logs. 

Our previous project, **Have I Been Ransomed? (HIBR)**, brought order to ransomware leaks by safely extracting personally identifiable information using advanced language models and optical character recognition. Now, this pipeline has evolved into **Dark Monitor**, a unified OSINT engine designed to automate identity pivoting across all three major exposure vectors. 

This project demonstrates how to connect these disparate underworlds into a single dashboard to track threat actors or map the complete exposure footprint of a target.

## The Technical Leap
Moving beyond simple regex scrapers requires entirely new automated pipelines. Our system introduces three critical technical advancements to solve the unstructured data problem and automate threat hunting:

* **Unstructured Data Pipeline**: Fine-tuned language models and YOLO-based OCR extract searchable data from raw PDFs, scanned passports, and HR records found in ransomware dumps.
* **Advanced Stealer Forensics**: Custom parsers go beyond basic credential scraping by decrypting local Telegram `tdata` session files, extracting chat histories, and indexing crypto wallet artifacts.
* **AI-Driven Correlation**: The Dark Monitor graph engine autonomously links isolated data points without manual lookup or human intervention.

### Example Use Case
To illustrate this correlation, imagine an analyst starting with a single compromised crypto wallet address. The AI engine automatically links that wallet from a stealer log to an email address in a classic database breach, which then connects to a Telegram ID, ultimately resolving to a physical home address found in a scanned ransomware PDF.

## How to Run

To execute the project, simply run the provided batch file:

```cmd
run.bat
```
""")
