file_name=$(date --date="" +"%Y"-"%m"-"%d").zip
/usr/bin/mysqldump -u hackmd -pxxxxxx --host 0.0.0.0 --port 3307 hackmd > $file_name

/home/deepcompute/docker-hackmd/env/bin/b2 authorize-account account_id secret_key
/home/deepcompute/docker-hackmd/env/bin/b2 upload-file hackmd $file_name $file_name || echo "failed to upload $file_name"
rm $file_name
