import fs from 'node:fs';
import path from 'node:path';

export class FileStore {
  constructor(directory) {
    this.directory = directory;
    fs.mkdirSync(directory, {recursive: true});
  }
  file(id) {
    if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error('invalid id');
    return path.join(this.directory, `${id}.json`);
  }
  read(id) {
    const file = this.file(id);
    return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
  }
  write(claim) {
    fs.writeFileSync(this.file(claim.id), JSON.stringify(claim, null, 2));
    return claim;
  }
}
