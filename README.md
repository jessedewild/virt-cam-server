sudo apt install -y --no-install-recommends gdb git build-essential devscripts pkg-config libgstreamer1.0-dev libgstreamer-plugins-base1.0-dev libgstreamer-plugins-bad1.0-dev gstreamer1.0-plugins-base gstreamer1.0-plugins-good gstreamer1.0-plugins-bad gstreamer1.0-plugins-ugly gstreamer1.0-libav gstreamer1.0-tools gstreamer1.0-x gstreamer1.0-alsa gstreamer1.0-gl gstreamer1.0-gtk3 gstreamer1.0-qt5 gstreamer1.0-pulseaudio libges-1.0-dev libgstrtspserver-1.0-dev libssl-dev nodejs npm wireless-tools

sudo modprobe bcm2835-v4l2

git clone https://github.com/jessedewild/virt-server.git 

sudo cp virt-server/generated-plugins/gstreamer-1.0/libgstcdg.so /usr/lib/aarch64-linux-gnu/gstreamer-1.0/

sudo cp virt-server/generated-plugins/pkgconfig/gstcdg.pc /usr/lib/aarch64-linux-gnu/pkgconfig

cd /virt-server

npm install

npm run start