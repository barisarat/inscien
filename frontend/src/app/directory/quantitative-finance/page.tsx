"use client"
import DirectoryDetailPage, { Section } from "../DirectoryDetailPage"

const tools: string[] = [
  "https://marketchameleon.com/Overview/AMZN/IV/",
  "https://www.investlabs.ai/",
  "https://www.analystai.ai/",
  "https://www.edelman.com/trust/2025/trust-barometer",
  "https://www.tikr.com/",
  "https://edition.cnn.com/markets/fear-and-greed",
  "https://www.nyse.com/quote/XNYS:DD",
  "https://www.reuters.com/markets/",
  "https://www.bis.org/forum/research.htm?m=156",
  "https://stratechery.com/",
  "https://themacrocompass.org/",
  "https://www.ranenetwork.com/",
  "https://signal-ai.com/signal-ai-global-risk-tracker/",
  "https://www.trendtracker.ai/use-cases/risk-management",
  "https://www.dataminr.com/",
  "https://datarade.ai/data-categories/quantitative-model-data/providers",
  "https://www.factset.com/marketplace/catalog/product/quant-factor-library",
  "https://www.quantconnect.com/datasets/",
  "https://quantpedia.com/links-tools/",
  "https://www.quiverquant.com/home/",
  "https://www.quiverquant.com/home/",
  "https://www.kavout.com/",
  "https://www.auquan.com/",
  "https://quantumstreetai.com/",
  "https://trendspider.com/",
  "https://tradingtechnologies.com/",

]

export default function QuantitativeFinancePage() {
  return (
    <DirectoryDetailPage title="Quantitative Finance">
      <Section title="Tools">
        <ul>
          {tools.map((href) => (
            <li key={href}>
              <a href={href} target="_blank" rel="noopener noreferrer">
                {href}
              </a>
            </li>
          ))}
        </ul>
      </Section>
    </DirectoryDetailPage>
  )
}