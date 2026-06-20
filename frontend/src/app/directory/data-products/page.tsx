"use client"
import DirectoryDetailPage, { Section } from "../DirectoryDetailPage"

const products: string[] = [
  "https://www.databricks.com/#ai",
  "https://www.snowflake.com/en/",
  "https://kensho.com/",
  "https://www.palantir.com/",
  "https://deepmind.google/",
  "https://feedly.com/",
  "https://www.tegus.com/",
  "https://www.recoll.org//pages/recoll-windows.html",
  "https://www.redfin.com/news/data-center/",
  "https://planetarycomputer.microsoft.com/explore?c=55.1434%2C25.0710&z=14.16&v=2&d=sentinel-2-l2a&m=Most+recent+%28low+cloud%29&r=Natural+color&s=false%3A%3A100%3A%3Atrue&sr=desc&ae=0",
  "https://housemetric.co.uk/map/",
  "https://dxbinteract.com/",
  "https://data.binance.vision/?prefix=data/spot/daily/aggTrades/BTCUSDT/",
  "http://data.gdeltproject.org/events/",
  "https://rsmetrics.com/",
  "https://datacommons.org/place/country/USA?utm_medium=explore&mprop=amount&popt=EconomicActivity&cpv=activitySource,GrossDomesticProduction&hl=en",
  "https://setosa.io/ev/principal-component-analysis/",
  "https://www.quantitativebrokers.com/blog/a-brief-history-of-implementation-shortfall",
  "https://research.com/scientists-rankings/computer-science",
  "https://seekingalpha.com/",
  "https://quantpedia.com/screener",
  "https://www.decision.ai/",
  "https://www.drivendata.org/",
  "https://www.sphinx.ai/",
  "https://julius.ai/",
  "https://www.make.com/en",
  "https://n8n.io/",
  


]

const dataSources: { href: string; label: string }[] = [
  { href: "https://data.bis.org/topics/RPP/BIS,WS_DPP,1.0/Q.MT.0.1.0.0.0.0", label: "BIS — Real Estate Prices" },
  { href: "https://data.bis.org/topics/CPI/BIS%2CWS_LONG_CPI%2C1.0/M.AE.628?view=chart", label: "BIS — Long-Term CPI" },
  { href: "https://wrds-www.wharton.upenn.edu/login/?next=/search/%3FactiveTab%3DnavAlgoliaSearchTab", label: "WRDS — Long Term Studies (Ozu account, one-time publish only)" },
  { href: "https://uaestat.fcsc.gov.ae/en", label: "UAE Federal Competitiveness and Statistics Centre" },
  { href: "https://www.dsc.gov.ae/en-us/Themes/Pages/Prices.aspx?Theme=25&year=2024#DSC_Tab1", label: "Dubai Statistics Center — Prices" },
  { href: "http://data.gdeltproject.org/documentation/GDELT-Global_Knowledge_Graph_Codebook-V2.1.pdf", label: "GDELT — Global Knowledge Graph Codebook v2.1" },
  { href: "https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library.html", label: "Fama-French Data Library" },
  { href: "https://www.dataroma.com/m/home.php", label: "Dataroma — Portfolio Updates" },
  { href: "https://www.cmegroup.com/markets/interest-rates/cme-fedwatch-tool.html", label: "CME FedWatch Tool" },
  { href: "https://jse.amstat.org/jse_data_archive.htm", label: "Public Data Repository for research" },


]

export default function DataProductsPage() {
  return (
    <DirectoryDetailPage title="Data Products">
      <Section title="Products">
        <ul>
          {products.map((href) => (
            <li key={href}>
              <a href={href} target="_blank" rel="noopener noreferrer">
                {href}
              </a>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Data Sources">
        <ul>
          {dataSources.map((s) => (
            <li key={s.href}>
              <a href={s.href} target="_blank" rel="noopener noreferrer">
                {s.href}
              </a>{" "}
              ({s.label})
            </li>
          ))}
        </ul>
      </Section>
    </DirectoryDetailPage>
  )
}