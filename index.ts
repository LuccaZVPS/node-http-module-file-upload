import fs, { WriteStream } from "fs";
import path from "path";
import http, { IncomingMessage, ServerResponse } from "http";
import { EventEmitter } from "events";
let fields: FormDataObject = {};
const max = 100000000;
const min = 1000000;
const recursive = (
  chunk: any,
  boundaryBuffer: Buffer,
  endBoundaryBuffer: Buffer,
  eventEmitter: EventEmitter,
  initial?: boolean
) => {
  if (chunk.length === 0) {
    return;
  }

  let boundaryIndex = chunk.indexOf(boundaryBuffer);

  if (boundaryIndex === 0 || initial) {
    if (chunk.length === endBoundaryBuffer.length + 2) {
      eventEmitter.emit("final");
      return;
    }
    const headerEndIndex = chunk.indexOf("\r\n\r\n");
    const header = chunk
      .slice(boundaryBuffer.length, headerEndIndex)
      .toString();

    fields = parseFormDataHeader(header);
    chunk = chunk.slice(headerEndIndex + 4);
    eventEmitter.emit("file", fields.filename);
  }

  if (boundaryIndex === 2 && chunk.toString().indexOf("\n") === 1) {
    chunk = chunk.slice(2);
    const headerEndIndex = chunk.indexOf("\r\n\r\n");
    const header = chunk
      .slice(boundaryBuffer.length, headerEndIndex)
      .toString();

    if (chunk.indexOf(endBoundaryBuffer) === 0) {
      eventEmitter.emit("final");
      return;
    }
    fields = parseFormDataHeader(header);
    chunk = chunk.slice(headerEndIndex + 4);
    eventEmitter.emit("file", fields.filename);
  }
  boundaryIndex = chunk.indexOf(boundaryBuffer);

  if (boundaryIndex == -1 && chunk.length > 0) {
    eventEmitter.emit("chunk", chunk);
    return;
  }

  if (chunk.length + 1 === endBoundaryBuffer.length) {
    eventEmitter.emit("finish");
    return;
  }

  eventEmitter.emit("chunk", chunk.slice(0, boundaryIndex - 2));
  recursive(
    chunk.slice(boundaryIndex),
    boundaryBuffer,
    endBoundaryBuffer,
    eventEmitter,
    true
  );
};

const server = http.createServer(
  async (req: IncomingMessage, res: ServerResponse) => {
    if (
      req.method === "POST" &&
      req.headers["content-type"]?.startsWith("multipart/form-data")
    ) {
      const boundary = req.headers["content-type"].split("; ")[1].split("=")[1];
      const boundaryBuffer = Buffer.from(`--${boundary}`);
      const endBoundaryBuffer = Buffer.from(`--${boundary}--`);
      const eventEmitter = new EventEmitter();

      eventEmitter.setMaxListeners(0);
      const chunkHanldler = () => {
        return new Promise((r, rr) => {
          let writeStream: WriteStream | null = null;

          eventEmitter.on("file", (c) => {
            const name = path.join(
              __dirname,
              "uploads/" +
                Math.floor(Math.random() * (max - min + 1)) +
                min +
                Date.now() +
                "." +
                c.split(".")[0]
            );
            writeStream = fs.createWriteStream(name);
          });
          eventEmitter.on("chunk", (c) => {
            writeStream!.write(c);
          });
          eventEmitter.on("finish", () => {
            writeStream!.end();
            writeStream = null;
          });
          eventEmitter.on("final", () => {
            writeStream!.end();
            writeStream = null;
            eventEmitter.removeAllListeners();
            r(null);
          });
        });
      };

      const dataHandler = () => {
        return new Promise((r, rr) => {
          req.on("readable", () => {
            let chunk = req.read();
            if (!chunk) {
              return;
            }
            recursive(chunk, boundaryBuffer, endBoundaryBuffer, eventEmitter);
          });
          req.on("end", () => {
            res.writeHead(200, { "Content-Type": "text/plain" });
            res.end("Arquivo recebido com sucesso!");
            r(null);
          });
        });
      };

      dataHandler();
      await chunkHanldler();
    } else {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("Requisição inválida");
    }
  }
);

interface FormDataObject {
  type?: string;
  name?: string;
  filename?: string;
  [key: string]: string | number | undefined;
  size?: number;
}
function parseFormDataHeader(headerText: string): FormDataObject {
  const formDataObject: FormDataObject = {};
  const lines = headerText.split("\n").filter((line) => line.trim() !== "");

  lines.forEach((line) => {
    const [key, value] = line.split(":").map((item) => item.trim());

    if (key === "Content-Disposition") {
      const [, type, ...attributes] = value
        .split(";")
        .map((attr) => attr.trim());
      formDataObject["type"] = type;

      attributes.forEach((attribute) => {
        const [attrKey, attrValue] = attribute
          .split("=")
          .map((attr) => attr.trim());
        formDataObject[attrKey] = attrValue.replace(/"/g, ""); // Remove double quotes
      });
    } else {
      formDataObject[key] = value;
    }
  });

  return formDataObject;
}

server.listen(3000);
