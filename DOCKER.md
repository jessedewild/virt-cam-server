docker build -t gst-plugins-rs . && docker run --name gst-plugins-rs gst-plugins-rs && docker cp gst-plugins-rs:/generated-plugins ./generated-plugins && docker rm -f gst-plugins-rs

sudo cp virt-server/exported-plugins/gstreamer-1.0/libgstcdg.so /usr/lib/aarch64-linux-gnu/gstreamer-1.0/

sudo cp virt-server/exported-plugins/pkgconfig/gstcdg.pc /usr/lib/aarch64-linux-gnu/pkgconfig
