# Kibana CSV Export

The csv_export folder contains a modified version of doc_table components compatible with Kibana OSS 6.8.0. This adds an export as csv feature to your searches in discover.

Copy the contents of the folder to `kibana/src/ui/public/doc_table` and replace the existing files there. After that delete the `optimize` folder and the next time you run kibana, it will rebuild the components and the export feature will be available.

Check out the other branches to see if the code there works with your version. Code on 6.8.x is not compatible with 6.6.x and below and vice-versa. If you run into any issue, just let me know and I might be able to help.

I've created this patch since the csv export feature is not available in Kibana OSS versions and the csv patch maintained by [fbaligand](https://github.com/fbaligand/kibana/releases) is not compatible with Kibana 6.

Hope this helps someone!

### Docker

If you are deploying kibana as docker container, adding the following to your Dockerfile will add the csv export feature to kibana.

```Dockerfile
COPY csv_export/doc_table /usr/share/kibana/src/ui/public/doc_table/

RUN rm -rf /usr/share/kibana/optimize
```

### Credits

The original csv-export was created by [fbaligand](https://github.com/fbaligand/kibana/releases).

### License

[MIT](https://choosealicense.com/licenses/mit/)
