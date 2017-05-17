'use strict';

const path = require('path');
const fs = require('fs');
const lnf = require('lnf');
const pmx = require('pmx');
const pm2 = require('pm2');
const s3 = require('s3');

const display = { G: 'GREEN', B: 'BLUE' };

pmx.initModule(require('./style.json'), (err, conf) => {

    const Probe = pmx.probe();
    const curr = Probe.metric({
        name: 'Current'
    });
    curr.set(fs.realpathSync(conf.app_path).includes('/B/') ? 'BLUE' : 'GREEN');
    pm2.connect(err2 => {
        if (err || err2) {
            console.error(err || err2);
            return process.exit(1);
        }

        /**
         * Swap Action
         */
        pmx.action('swap', function (reply) {
            console.log('Swapping currently active app artifact');

            const swap = fs.realpathSync(conf.app_path).includes('/B/') ? 'G' : 'B';

            lnf(path.relative(
                path.dirname(conf.app_path),
                path.join(conf.work_path, swap, path.basename(conf.app_path))),
                conf.app_path,
                'dir',
                () => {
                    pm2.gracefulReload(conf.app_name,
                        () => {
                            curr.set(display[swap]);
                            return reply({
                                status: 'OK',
                                info: 'Grecefully reloading cluster'
                            });
                        });
                });
        });


        /**
         * Update artifact from S3 Action
         */

        const client = s3.createClient({
            s3Options: {
                accessKeyId: conf.accessKeyId,
                secretAccessKey: conf.secretAccessKey,
                region: conf.region
            }
        });

        pmx.action('updateS3', reply => {

            console.log('Downloading file: ', conf.S3_key);

            const params = {
                localFile: path.join(conf.work_path, conf.S3_key),

                s3Params: {
                    Bucket: conf.S3_bucket,
                    Key: conf.S3_key
                }
            };

            const downloader = client.downloadFile(params);
            downloader.on('error', err => {
                console.error('unable to download:', err.stack);
                return reply({
                    res: 'ERROR'
                });
            });
            downloader.on('progress', () => {
                console.log('progress', downloader.progressAmount, downloader.progressTotal);
            });
            downloader.on('end', () => {
                console.log('done downloading', conf.S3_key);
                return reply({
                    status: 'OK',
                    info: 'Code deployed from S3 on un-active color'
                });
            });
        });
    });
});
