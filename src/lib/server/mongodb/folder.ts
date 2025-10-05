import { db } from "./db";
import type { TagFolderOptions } from "../tag/folder";

export const folders = db.collection<TagFolderOptions>("folders");
await folders.createIndex({ name: 1 }, { unique: true });

/*tags.insertOne({
        name: "test",
        path: "/demo/test",
        dataType: "Double",
        nodeId: "ns=1;s=[device]/fhr100",
        initialValue: 10.1123
    });*/
