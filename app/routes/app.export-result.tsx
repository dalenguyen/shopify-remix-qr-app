import { LoaderFunction, json } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import { Banner, Card, Layout, Page, ProgressBar } from "@shopify/polaris";
import axios from "axios";
import Papa from "papaparse";
import { useEffect, useState } from "react";
import { authenticate } from "~/shopify.server";

type BulkOperation = {
  id: String;
  url: String;
  status: String;
  completedAt: String;
  startedAt: String;
  format: String;
};

export const loader: LoaderFunction = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  const response = await admin.graphql(
    `#graphql
      query {
        currentBulkOperation {
          id
          status
          errorCode
          createdAt
          completedAt
          objectCount
          fileSize
          url
          partialDataUrl
        }
      }
    `,
  );

  if (response.ok) {
    console.log("----------status export result ------");
    const data = await response.json();
    console.log(data, "responseeeeee");

    return json(await data.data.currentBulkOperation);
  }

  return null;
};

export default function ExportResultPage() {
  const data: BulkOperation = useLoaderData<typeof loader>();
  console.log(data);

  const [pollingData, setPollingData] = useState(data);
  const [shouldPoll, setShouldPoll] = useState(true);
  const [readyUrl, setReadyUrl] = useState("");

  useEffect(() => setPollingData(data), [data]);

  const fetcher = useFetcher();

  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === "visible" && shouldPoll) {
        fetcher.load("/app/export-result");
      }
    }, 10 * 1000);

    return () => clearInterval(interval);
  }, [shouldPoll, fetcher.load]);

  useEffect(() => {
    if (fetcher.data) {
      setPollingData(fetcher.data as BulkOperation);

      const { status, url } = fetcher.data as BulkOperation;

      setReadyUrl(url as string);

      if (status === "COMPLETED") {
        setShouldPoll(false);
        console.log("----polling stopped-----");
      }
    }
  }, [fetcher.data]);

  const downloadData = async () => {
    try {
      const response = await axios.get(readyUrl);

      const lines = response.data.split("\n");

      const jsonArray = lines
        .map((line: string) => {
          try {
            return JSON.parse(line);
          } catch (error) {
            console.error("error parsing the data", error);
            return null;
          }
        })
        .filter(Boolean);

      const csvData = Papa.unparse(jsonArray);

      const blob = new Blob([csvData], { type: "text/csv;charset=utf-8" });

      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);

      link.download = "output.csv";

      document.body.appendChild(link);
      link.click();

      document.body.removeChild(link);
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <Page>
      <ui-title-bar title="Export Result Page">
        <button variant="breadcrumb">Home</button>
        <button onClick={() => {}}>Back</button>
        <button variant="primary" onClick={downloadData}>
          Download Exported File
        </button>
      </ui-title-bar>

      {pollingData.status === "RUNNING" && (
        <Layout>
          <Layout.Section>
            <Banner title="Export in Progress">
              <ProgressBar progress={75} />
            </Banner>

            <br />

            <Card>
              <p>In progress</p>
              <p>ID: {pollingData.id}</p>
              <p>STATUS: {pollingData.status}</p>
            </Card>
          </Layout.Section>
        </Layout>
      )}

      {pollingData.status === "COMPLETED" && (
        <Layout>
          <Layout.Section>
            <Banner
              title="Export Finished"
              tone="success"
              action={{
                content: "Download Exported File",
                onAction: downloadData,
              }}
            />

            <br />

            <Card>
              <p>ID: {pollingData.id}</p>
              <p>STATUS: {pollingData.status}</p>
              <p>URL: {pollingData.url}</p>
            </Card>
          </Layout.Section>
        </Layout>
      )}
    </Page>
  );
}
