npm run build:linux
cd dist/linux-unpacked
sudo chown root:root chrome-sandbox
sudo chmod 4755 chrome-sandbox
./wasrtk
cd ..
cd ..
