import { fs } from "zx";

export class ChartVersionFile {
    public static readonly name = "chart-version.txt";

    public static read(): string {
        return fs.readFileSync(ChartVersionFile.name).toString().trim();
    }

    public static write(content: string) {
        fs.writeFileSync(ChartVersionFile.name, content);
    }
}
