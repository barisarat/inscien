"use client"
import DirectoryDetailPage, { Section } from "../DirectoryDetailPage"

const samples: string[] = [
  "https://webrodcepedamarin.herokuapp.com/",
  "https://shapash-demo.ossbymaif.fr/",
  "https://speichermonitor.eco-stor.de/",
  "https://amazonchallenge-122629525979.southamerica-east1.run.app/puchase_overview",
  "https://dash-molstar.everburstsun.net/drugs",
  "https://tracking-dashboard-app.herokuapp.com/dashboard",
  "https://ivan96.pythonanywhere.com/",
  "https://dash.gallery/dash-nlp/",
  "https://gabria1.pythonanywhere.com/step1",
  "https://stocktistics.com/stocksaavy",
  "https://gabria1.pythonanywhere.com/step2",
  "https://omnixai-24e10803fd23.herokuapp.com/",
  "https://ukhouseprice.project-ds.net/",
  "https://dash.gallery/dash-uber-rides-demo/",
  "https://demo-fiako-stations.herokuapp.com/",
  "https://natatsypora.pythonanywhere.com/",
]

export default function DashSamplesPage() {
  return (
    <DirectoryDetailPage title="Dash Library Samples">
      <Section title="Samples">
        <ul>
          {samples.map((href) => (
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