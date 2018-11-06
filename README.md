# Docker 102 workshop - Multi-stage builds and compose

- [Getting started](#getting-started)
- [Multi-stage builds](#multi-stage-builds)
	- [Comparison: the advantages of multi-stage builds](#comparison-the-advantages-of-multi-stage-builds)
		- [The conditions](#the-conditions)
		- [The old way](#the-old-way)
		- [The new way](#the-new-way)
	- [Conclusion](#conclusion)
- [Docker Compose](#docker-compose)
	- [Connecting an application to a database without compose](#connecting-an-application-to-a-database-without-compose)
	- [Container orchestration with Compose](#container-orchestration-with-compose)
		- [The docker-compose.yml file](#the-docker-composeyml-file)
		- [Creating a simple compose file](#creating-a-simple-compose-file)
		- [Running the docker-compose file](#running-the-docker-compose-file)
		- [Updating containers with the docker-compose.yml file](#updating-containers-with-the-docker-composeyml-file)
		- [Updating containers without modifying the compose file](#updating-containers-without-modifying-the-compose-file)
		- [Stop, start, and restart](#stop-start-and-restart)
		- [Cleaning everything up](#cleaning-everything-up)
	- [Building images using Docker Compose](#building-images-using-docker-compose)
	- [Using the host machines environment variables](#using-the-host-machines-environment-variables)
	- [Using volumes](#using-volumes)
	- [Overriding Compose files](#overriding-compose-files)
- [Security](#security)
	- [Docker Bench for Security](#docker-bench-for-security)
	- [Using the Bench](#using-the-bench)
- [Further reading](#further-reading)

# Getting started

If you aren't using the VirtualBox image, then you can move on to the next chapter.
If you are using the VirtualBox image, you have to install Docker Compose (Sorry, we forgot :( ).
To install Docker Compose, run the following commands in the terminal:

	sudo -i
    <enter password: dockerworkshop>
    curl -L https://github.com/docker/compose/releases/download/1.14.0/docker-compose-`uname -s`-`uname -m` > /usr/bin/docker-compose
    chmod +x /usr/bin/docker-compose
    exit

After that restart the terminal and try running `docker-compose --version`.

# Multi-stage builds

When building images for production environments, it is best to keep
them as small as possible by including only the essentials required for
running the container. One aspect of this is using a minimum of
instructions in your Dockerfile, as each one will build an extra layer.
Another one is ensuring that the image contains only that which is
absolutely necessary to run the application it contains. It should, for
one, not contain anything that is only required for building the
application.

Traditionally, a lot of developers used a builder pattern, in which they
had one Dockerfile to build the application and another one that would
receive the resulting artefact. This second container would therefore
have no need for any of the buildtools and other development
dependencies used in the first one, decreasing the size of the resulting
image. While this approach works well, the downside is that it still
requires two separate Dockerfiles to be maintained. Furthermore, if you
want everything to be build automatically (which, of course, you do),
you’ll need something like a shell script to start the builds and copy
the artefact from the first to the second container.

Docker 17.05 introduced a way to simplify this entire process, called
multi-stage builds. Using this feature, you can define different build
stages in a single Dockerfile, selectively passing artefacts from one
stage of the build to the next one. Additionally, each stage can start
building from a different base, allowing you to create images with only
that which is required for a specific stage.

## Comparison: the advantages of multi-stage builds

### The conditions

To demonstrate the advantages of using multi-stage builds, we are going
to create two images that will end up giving the same result. The
restrictions are that the image must be build from source inside a
container and all of it must be done using a single Dockerfile and
without any complicated shell scripting. Therefore, we can’t make use of
the old builder pattern. These restrictions may seem arbitrary, but we
want to reduce the complexity of the building process by not having
multiple Dockerfiles that need to be maintained, as well as not having
to know Bash or any other shell scripting languages.

The application in both images is the same Spring Boot app which we
will build using the Gradle build tool. Since it is a Spring
application, we need to have a JDK to compile the Java classes. In
addition, we need Gradle to build the jar-file as our resulting
artefact, with all dependencies included.

### The old way

As stated in the conditions, we will not use the builder pattern due to
the restriction of having to do everything in one Dockerfile, and one
Dockerfile only. As we are building from sources, we’ll need to have a
container which has a JDK. Luckily, there is an Alpine-based image
available from OpenJDK that contains exactly what we need. Also, since
it is based on Alpine Linux, it is already quite small.

The application is located in the `multistage` folder of this workshop.
Therein, you’ll find another folder, called `multistage1` which contains all the source files of the application.
This contents of this folder will have to be copied to the container that will build the resulting jar-file.
There is also a `.dockerignore` file present to prevent unwanted files from being copied.

In the `multistage` folder, next the the folder containing the application, create a new Dockerfile.
Instead of the default name `Dockerfile`, call this one `DockerfileSinglestage`.
In the file, enter the following instructions:

    FROM    openjdk:jdk-alpine
    WORKDIR /opt/app
    COPY    multistage1/ .
    RUN     chmod +x ./gradlew && \
			./gradlew build && \
            cp build/libs/app.jar /opt && \
            rm -rf ~/.gradle && \
            rm -rf /opt/app
    WORKDIR /opt
    EXPOSE  8080
    CMD     java -jar app.jar


These instructions already contain some good attempts to try and keep
the resulting image size to a minimum. We use an Alpine-based image for
the JDK, and after the build process the Gradle cache and even the
application source files are deleted, of course only after copying our
freshly created .jar file to a safe location. This example in particular
has the added advantage of using the Gradle Wrapper, meaning we can
automatically download Gradle on the fly and remove it afterwards as
well. This saves us from the need to create a container which has Gradle
already installed. The image, however, still contains the JDK, which is
redundant as we only need its Development Kit parts during the
compilation process. Once the application is build, we just need a
runtime environment.

Nevertheless, build this image using the following command:

    docker build -f DockerfileSinglestage -t multistage:singlestage .


Because we are not using the default name for our Dockerfile, we specify
the one we wish to use with the `-f` option. Furthermore, we tag it as
`multistage:singlestage`. This should take some time, as both Gradle and the
application dependencies will have to be downloaded.

Once the building process is done, you can verify its size using
`docker images`. It is probably around 116MB. Feel free to run a
container to test our image:

    docker run -it -p 8080:8080 multistage:singlestage


Go to <http://localhost:8080> to verify that the application actually
works.

### The new way

With that out of the way, we’re going to create the same image using a
multi-stage build. This allows us to easily create an image with only
the bare minimum we need. Once again, create a Dockerfile, but call this
one `DockerfileMultistage`. Copy the following in it:

    FROM    openjdk:jdk-alpine as build
    WORKDIR /opt/app
    ADD     multistage1/ .
    RUN     chmod +x ./gradlew && \
	        ./gradlew build
    FROM    openjdk:jre-alpine
    COPY    --from=build /opt/app/build/libs/app.jar /app/app.jar
    EXPOSE  8080
    CMD     java -jar /app/app.jar


There are a couple of things that are different when compared to our
previous Dockerfile. First of all, there are two `FROM` instructions,
both specifying a different base image to build from. That also means
this particular Dockerfile has two different stages (it is determined by
the number of `FROM` instructions). The first one uses the
`openjdk:jdk-alpine` image we used in the previous build, but the second
one uses the `openjdk:jre-alpine` one that only contains the Java Runtime
Environment. This last image lacks all the Java Development Kit tools
needed for compiling Java classes, thus it is smaller in size.

Another difference is that in the first `FROM` instruction, an *alias*
is given using the `as` keyword. While this is optional, it is very
useful to add as we can use it as a reference to this stage of the
build.

The final main difference is that we don’t have to think about cleaning
up things we don’t need in the first stage. In our DockerfileSinglestage we
cleaned up the Gradle cache, and the app itself. Thanks to Docker
multi-stage builds we don’t have to do that any more, or at least not
for any stage that does not create the final image. Only the image
created in the last stage will be saved under the given tag. All others
will be cached, but are basically considered completely separate images,
therefore making any cleaning work in intermittent stages redundant.

In the second stage, we refer to the first one in the `COPY` instruction
by using the `--from` option. We can use the alias of the stage, if one has
been given, which in this case is `build`, to refer to it. If you don’t
use an alias, you can refer to it using a number, which is 0 for the
first one, 1 for the stage after that etc. You can probably imagine how
difficult it can become to read such numeric references in a large
Dockerfile with several stages. It is, therefore, definitely recommended
to use aliases to improve both readability and maintainability. Other
than the `--from` option, the `COPY` works the same as usual. We simply
copy the app.jar from the first stage to the /app directory in our
second stage. After that, we just expose the application port and define
the default command just as we did in the other Dockerfile.

Now, build this image with the following command:

    docker build -f DockerfileMultistage -t multistage:multistage .


This will take some time as well. As stated before, the image built in
the last stage will be the one that will actually be the image that is
created and tagged, in our case using the `multistage:multistage` tag.

Once the build process is complete, run the following command to test it:

	docker run -it -p 8080:8080 multistage:multistage

And go to <http://localhost:8080> again to verify that it works.
Now stop the container, and let's take a look at the images.
Run `docker images` to see the difference in size between the two images. The `multistage:multistage`
one should be smaller, which is around 96MB, as it does not contain any
of the JDK tooling that is still present in `multistage:singlestage`. To verify
if the application is still working, you can try running it for
verification. Make sure you bind port 8080 if you want to be able to
navigate to it from your localhost.

Did you notice something else when running `docker images`? There is
also a new dangling image `<none>:<none>` which is almost 300MB. If you
run the `docker build...` command again, you can see that our first
stage is cached as well. As it turns out, all the other stages of a
multi-stage build become dangling images, so Docker can still cache the
layers properly. To remove dangling images, run the following command:

    docker image prune


## Conclusion

In the above exercise, the example was quite trivial. While the
multi-stage image was smaller in size, this might not be to an extend
that many would consider ground breaking. The difference we made was
only around 20MB (however. we already did our best to reduce the size of the
first image!). There are, however, some languages that require quite an
extensive build environment to be set up. This can include a large
amount of SDK tooling, e.g. for compiling purposes, as well as other
build tools, library dependencies and so on. Cleaning up everything that
is redundant after the build can then become quite a task as well, and
it can add to the amount of layers created or the complexity of the
Dockerfile.

It should also be noted that the old builder pattern, using two
Dockerfiles and a shell script, could produce the exact same end result
as the multi-stage build. In this aspect, multi-stage builds just
provide a cleaner way to achieve the same. It saves you from having to
keep track of multiple Dockerfiles by combining all stages into one, as
well as not having to hack with shell scripts that, apart from having to
be maintained as well, might also not work on every OS.

All in all, this feature contributes mostly to the practice of keeping
images as small as possible while keeping everything readable and
maintainable.

# Docker Compose

When putting Docker into practice, you’ll often find yourself needing
more than just a single container. Even a small, simple application can
easily consist of a front-end, back-end and a database. You could, of
course, put all these components into a single container, in a way
similar to how you might work with traditional virtual machines. The
philosophy of Docker is, however, to keep containers small and letting
them only do one thing.

Luckily, there is the concept of linking, allowing containers to be
separated in their purpose but linked together as if they were different
machines connected to each other. Before we use Docker Compose, we will
first link some containers the manual way.

## Connecting an application to a database without compose

In this exercise, we are going to run a NodeJS / Angular application
that needs to connect to a MongoDB database. The application and
database will run in separate containers and we will use linking to
allow communication between the two. First, we need to create a new
image that will contain the application. Go to the `todo_app` directory.
It should contain one other folder named `todo`, in which the
application files are located, and a Dockerfile.

Build the image and name it `node/todo_app`. If the build was
successful, feel free to try and run it. Don’t be alarmed by the error
message that Node will print, this is due to the application failing to
get a database connection.

As stated before, the application requires a MongoDB database to connect
to. There is an image available, conveniently called `mongo`, that has
all we need. To connect the containers to each other we have to make sure 
that they are in the same network. To do this, we first need to create a network

    docker network create my-awesome-network


We can now start the mongo service as a forked process and name, because the name 
is used as the hostname for this container within the network:

    docker run -d --net=my-awesome-network --name=mongodb mongo


As you can see, we pass the name of our network when running the container.
With the database up and running, we can now start our application. In
order for it to connect to the database, we need to make sure that our app joins 
the same network. Furthermore, we are going to forward port 8080 to our localhost, 
as this is the port that the application is listening on. Execute the following command:

    docker run -it -p 8080:8080 --net=my-awesome-network node/todo_app


If everything went correctly, you should be able to see it running on
<http://localhost:8080>. The name option we used for starting mongo is also the hostname. 
That means that inside our node/todo\_app container the url for the mongodb would be <http://mongodb/>.

While we only linked two containers in this exercise, you could link any
number you’d like. This method allows you to build a more complex
infrastructure of containers that are able to connect to each other. As
you might have guessed though, there is an easier way to achieve this
than manually creating networks.

NOTE: You may also see the option `--link` instead of creating a network to link two containers.
But this feature is deprecated, and should not be used.

## Container orchestration with Compose

Now that you have seen how creating a network works we can move on to
Docker Compose. Docker Compose allows you to define a set of containers
and some of their characteristics in a single YAML-file, by default
called `docker-compose.yml`. Using the compose tool you can then
automatically launch all these containers at once, without the need for
a single, manual `docker run` command. To demonstrate this, we’re going
through several scenarios which require two or more containers.

### The docker-compose.yml file

The docker-compose file, which uses the YAML language, describes how
Docker needs to run the containers you want. You can for example create networks for 
the containers, set environment variables, set the port mappings, and
even override the `CMD` instruction of an image. All you have to do is
run the command `docker-compose up`, and Docker runs all the containers described in your docker-compose.yml file. In this chapter we will show you all the options, and you will build a docker-compose.yml file yourself.

### Creating a simple compose file

As our first docker-compose file, we will run two containers. One of
them will be a PostgreSQL database, and the other will be phpPgAdmin,
which is a web-based administration tool for PostgreSQL databases.
Create a new directory called `postgresql`, and inside the directory create a file named `docker-compose.yml`. Then add the following to the file:

    version: '3.3'

    services:
      db:
        image: 'postgres:9-alpine'
        environment:
          POSTGRES_USER: 'wow'
          POSTGRES_PASSWORD: 'suchsecure'
          POSTGRES_DB: 'verypersist'
        ports:
          - '5432:5432'

      phppgadmin:
        container_name: phppgadmin
        image: dockage/phppgadmin:latest
        ports:
          - "80:80"
        environment:
          - PHP_PG_ADMIN_SERVER_HOST=db
          - PHP_PG_ADMIN_SERVER_PORT=5432
        depends_on:
          - db


In this file, we see a lot of different options. Let's start from the
top, which is the `version` option. This is used to specify the version of the Compose file format we want to use.
Every version has some extra features and changes, feel free to look up the differences.
Specifying it allows the compose tool to determine which features are considered to be available.
We are using the latest version, which is 3.3.

After that we describe all our services. The `db:` and `phppgadmin:`
parts of the file are the names of our services. These
can be anything you want and can be used as a reference in other parts
of the file.
When we look at the `db` service, it uses the image `postgres:9-alipine`, which will be pulled from the Docker Hub registry.

The `environment` option is for setting environment variables for that
specific container, the same way it works for a Dockerfile. In this case
we set the username and password for our database, and we create a
database named `workshop`. Furthermore, we have a `ports` option for our
database, which works like the `-p` option you have when using the `docker run` command.
Here, it maps port 5432 on the localhost to port 5432 of the container.

You can also declare a `container_name` for the service. This works the
same as the `--name` option of `docker run`. If you take a look
at the `environment` options for the `phppgadmin` service, you can see
it uses a different syntax than the `db` service. There is no real
specific reason for this, it is simply to show that Docker Compose
supports two different ways to declare our environment variables.

As you may have noticed, the environment variable for phppgadmin refers to the
database hostname by using the service name `db`. This works because
when using Compose all services automatically join the default network
created by docker using their service name as their hostname. So both of
our services can already reach each other. 

As for the option `depends_on`, it will be explained later.

In some cases you might see the option `links`, but in newer versions of Docker
this has been deprecated. As the name suggests it can link two services, using a 
specified hostname.

You can also specify your own networks, so you can restrict access to some services for example,
but that is out of scope for this workshop. You can find more information about it in the docker docs.

### Running the docker-compose file

To get everything up and running, run the following command from the
same directory as the docker-compose file you just created:

    docker-compose up -d


This tells Docker to use the docker-compose file and create the
containers for the services described in it. It also creates a network
for them. After all that is done it starts the containers. The `-d`
option means the same here as it does in `docker run`, namely that it
will run the containers in detached mode (in the background). It also
automatically downloads the images that are not available locally, which
is also just like the `run` command.

Now go to <http://localhost/> and test if it works. On the left side you
can click *PostgreSQL*, which will show a login page. Log in using the
credentials in the docker-compose file and you should be able to see the
database we described in it.

As you might have guessed, the `depends_on` 
impacts the order in which containers start up, which you probably
already saw in the output of running `docker-compose`. In this case
it first started the `db` container, followed by `phppgadmin`. Keep in
mind that it did not wait for the `db` container to be ready. It will
not wait until the application of the first container is ready, which
means that it’s quite possible that the MongoDB wasn’t ready when
`phppgadmin` started. The deprecated `links` option which has the
same syntax as `depends_on`, impacts the start up order in much the same
way.

There is no way to tell Docker that it needs to wait for the application
to have been started before firing up the next container, as there
simply is no way for Docker to know what exactly it means for an
application to be started anyway. This is part of the philosophy of
Docker, as containers are not to know what exactly goes on in the
applications inside them. Furthermore, containers are essentially ’not
worth rescuing’ and it should be possible to kill and replace them at
any time. Therefore, enforcing such hard and fragile dependencies
between containers would break some of the great advantages of using
Docker in the first place, in addition to hiding the much larger problem
of the application itself not being resilient enough. Handling database
connections, in this case, should not be the responsibility of Docker,
but rather of the application itself. The application should be able to
poll for a connection and include logic on what to do when a database
goes down for any reason. You can read more about this at
<https://docs.docker.com/compose/startup-order/>.

Nevertheless, let’s see in more detail what docker-compose has done for
us. First, let’s look at the containers, so run the `ps` command. You
will see that there are two containers, just as expected, with the
correct port mappings. Also take a look at the container names. As you
can see, the `container_name` option defined the container name of our
phpPgAdmin container. The database has a generated name, which is
something like this: `<directory-name>_db_1`. The directory-name
is the name of the directory which contains your docker-compose.yml
file. The number is just an index, because docker-compose also supports
scaling and it could create multiple containers of the same service.
Scaling, however, is out of the scope of this workshop.

Now run the command

    docker network list
    OR
    docker network ls


If you didn’t create a network yourself, you should see a few of them.
Three of them are defaults, which are named *host*, *bridge*, and *none*
(see
<https://docs.docker.com/network>
for more information on them). One of them named
`<directory-name>_default`, is created by docker-compose. Copy the
network ID of the network, and run the following command:

    docker network inspect <network id>


This will show the configuration of the network that docker-compose has
created for us in JSON. As you can see the network is used by both
containers, which allows them to communicate with each other.

### Updating containers with the docker-compose.yml file

Open up your docker-compose.yml file again, and now modify the port of
our phpPgAdmin service to:

    - "2837:80"


Save the file and run the compose up command again. Docker sees that the
docker-compose file has been modified, and it recreates containers if
necessary. As we didn’t change our `db` service, Docker reports that the
container is up-to-date. However, because we did change the phpPgAdmin
service, it stops and removes the old container and creates a new one.
Keep in mind that the old container is actually removed, thus all data
that is not stored in a volume is lost. Also feel free to run the
`network inspect` command again. You should see that the container ID is
updated as well. And, of course go, to <http://localhost:2837/> to test
if it works.

### Updating containers without modifying the compose file

Compose can update everything when we change our compose file, but
what if the image changes and the compose file doesn’t? That’s
definitely a scenario that can happen as we use the `latest` tag for our
phpPgAdmin image. To update it, simply run the `pull` command before
using `up`:

    docker-compose pull
    docker-compose up -d


Pro-tip for the extra lazy / time-efficiënt among us, you could of
course also create a shell script or alias to provide a shortcut for this.

### Stop, start, and restart

The containers created by docker-compose are no different from
containers you create with `docker run`. Therefore, you can stop, start,
and restart any of the containers with their respective docker commands.
Having to do this manually for every container in your compose file,
though, would be a tedious job, especially if you have a lot of services
in it. To facilitate in that, Docker has the same commands for
docker-compose. Run the following commands in the same order, to view
the statuses of the containers:

    docker-compose stop
    docker ps -a
    docker-compose start
    docker ps -a
    docker-compose restart


As expected, you can see how Compose first stops all containers, after
which it starts them again. The restart does exactly the same as a stop
and start combined. As the containers are only stopped, instead of being
destroyed and recreated, all state is kept, so you can continue where
you left off.

### Cleaning everything up

Another command that you might have guessed is `docker-compose down`.
Try it out now. This command does the exact opposite of
`docker-compose up`: it stops the containers, removes them, and removes
the network that was created. So it cleans up everything it created,
neat!

## Building images using Docker Compose

When using Docker Compose, you can also instruct it to build images
instead of pulling one from a registry. We already prepared an Angular
app and a Dockerfile for you to play around with. Go to the
`angular_app` directory. In there you will find the `app` directory,
which also contains the Dockerfile that will create an image for it.
Note that the Dockerfile does NOT have an `EXPOSE` instruction. Inside
the `angular_app` directory, create a Compose file with the following
contents:

    version: '3.3'

    services:
      angular-app:
        build: app
        ports:
          - "80:4200"


Although this isn’t a very useful file, as we only have one
service, it shows us a few features. The `build` option tells it to
build the image using the specified directory, which is `app` in our
case. Docker Compose will look for a Dockerfile inside that directory,
which it will use to build the required image. Note that the path is
relative. If you want to use an absolute path, prepend it with a ’/’.

Our Dockerfile does not have an `EXPOSE` instruction, so the `ports`
option has to do this for us. It exposes it to the host via port 80, and
to other services via port 4200. You can also use the `expose` option in
the Compose file, which then only exposes it to the other services.
This is essentially the same as an `EXPOSE` instruction in the Dockerfile.
Now try to run it with the command:

    docker-compose up -d


You should now see that it first builds the image because it doesn’t
exist yet. After the build is complete, it starts up the container. Test
the application by going to <http://localhost/>.

Now let's break our image. Remove the `CMD` instruction from the
Dockerfile of the Angular app. Now run the following command again:

    docker-compose up -d


If you test the app it still works. This is because Docker Compose does
not rebuild images unless you tell it to. Run the following command to
explicitly instruct a rebuild, after that run it again:

    docker-compose build
    docker-compose up -d


Now our image is being rebuild, and if you test the app you will see it
doesn’t work any longer. If you check the container status, you will see
that it isn’t even running because we didn’t specify a command.
So, let’s modify the docker-compose.yml file again to fix it:

    version: '3.3'

    services:
      angular-app:
        build: app
        ports:
          - "80:4200"
        command: npm start


Now run it again, and the application should work once more. The
`command` option also accepts a list similar to the `CMD` instruction
for the Dockerfile. Also note that the `command` option also *overrides*
the `CMD` instruction. There is also an `entrypoint` option, which
overrides the `ENTRYPOINT` instruction from the Dockerfile in a similar
fashion. In general, therefore, the instructions listed in the Compose
file are leading. It also nicely demonstrates that Docker Compose is not
limited for simply running sets of containers. It could also be used as
a specification for running even a single container, be it with, e.g, a
set of environment variables, exposed ports etc. This could be more
convenient than having to type out the entire `docker run` command every
time.

## Using the host machines environment variables

With Docker Compose you can also make use of the host machines’
environment variables. This can be very useful if you need certain
information from the host in your container.

Create a file named `environment.yml` with the following contents:

    version: '3.3'

    services:
      message:
        image: alpine:latest
        command: echo ${MESSAGE}


The \$ syntax allows us to refer to the host’ environment variables. You
can use it in a lot of places within the docker-compose file, e.g. the image name and tag, the port mappings, the volume mappings and so on.
To demonstrate this, run the following commands:

    FOR LINUX / OSX:
    export MESSAGE=Hello from the host!
    docker-compose -f environment.yml up

    FOR WINDOWS CMD:
    set MESSAGE=Hello from the host!
    docker-compose -f environment.yml up


You should now see our message being printed by the container.

As you can see it is fairly easy to use environment variables, making
them a really powerful feature for Docker Compose. This can be
especially helpful in things like an automated build pipeline. You could
then, for example, set the environment variables for the name and
version you want to give your image, and then use the same Compose file
in every build to create an image for a newer version of your
application. Also, some users could change some settings without
modifying the docker-compose file, like when they want to change the
exposed port because it is already in use by something else. All in all,
making good use of environment variables allows you to create Compose
files that can be reused in various situations.

One more thing regarding the `-f` option: it works exactly the same as
the one in the `docker build` command. With it, you can specify the file
that Docker Compose has to use, which is `docker-compose.yml` by
default. Using this option allows you to create different Compose files
in the same directory, which can be tuned for different scenarios. You
could, for example, create a set of files like this:

    docker-compose-dev.yml
    docker-compose-test.yml
    docker-compose-prod.yml


You can also set default values for the environment variables, in case
they aren’t set on the host. To do this, create a file named `.env` next to the
.yml file with the following contents:

    MESSAGE=This is the default message!


When you run the `docker-compose up` command, it will first check if a
certain variable is set on the host. If it isn’t, it will look at this
*.env* file to see if it can find any entry for it in there. Go ahead
and play around with it.

## Using volumes

Just like the run command, Docker Compose also supports volumes. There
are a couple of ways we can use volumes, which we will show now.

First create a new directory called `volumes`, and inside it create another one
called `data`. Inside the *data* directory create a textfile named `message.txt` and add
whatever message you want inside it. Finally, create a
docker-compose.yml file inside the *volumes* directory with the
following contents:

    version: '3.3'

    services:
      messageviewer:
        image: alpine:latest
        volumes:
          - ./data:/var/data
        command: "cat /var/data/message.txt"


Now run the Compose file:

    docker-compose up


This should show you your message.

The other way we can use volumes is by using a named volume. This is
mostly used to share data between containers and to persist it in the
event they are replaced. Create another docker-compose.yml file in an
empty directory with the following content:

    version: '3.3'

    services:
      dircreator:
        image: alpine:latest
        volumes:
          - data:/var/data
        command: mkdir /var/data/directory1

      dirreader:
        image: alpine:latest
        volumes:
          - data:/var/data
        command: "ls /var/data"
        depends_on:
          - dircreator

    volumes:
      data:


We added a new section to the docker-compose file which defines our
named volume `data`. You can use this name to refer to it in any of the
services in your compose file. Our first service will create a directory
in */var/data* while the second one will show the contents of
*/var/data*. Now run the compose file and you should see that the
directory is listed by our second service:

    docker-compose up


Now modify the docker-compose.yml file by changing the name of the
directory that is created to *directory2*. Then, run `docker-compose up`
again and you should now see two directories! Docker Compose created a
volume for us which is re-used when we run it a second time. Feel free
to verify this by running the following command:

    docker volume ls


You should see a volume named `<directory-name>_data`. Keep in mind
that this volume is not removed when you run `docker-compose down`. Feel
free to try this out and verify it.

## Overriding Compose files

As stated before, the default file that Docker Compose looks for is a one called `docker-compose.yml` in the directory from which you execute your compose command.
There is, however, another, optional, file that it will look for by default, which is `docker-compose.override.yml`.
This one is structured much in the same way as `docker-compose.yml`, but differs in the fact that it can extend or override anything from it.

Now, why would you not just put everything in a single compose file?
Many times you want to define different configurations for different environments, e.g. a development and production environment.
These may overlap in part, such as that you want the same amount of services from the same images.
Other factors, however, such as exposed ports or environment variables may differ.

In such a case, you can use your `docker-compose.yml` as a base file and have it contain the parts that are shared between environments.
You can then define a `docker-compose.override.yml` for development purposes, as it is picked by default when using `docker-compose up`.
In addition to that, you can create another file, e.g. called `docker-compose.prod.yml`, that contains the configuration you need for production.

Let's give this a try.
Go to the *override* directory.
There you should find a single folder called *app*, which holds a simple Node application and a Dockerfile to build it.
Next to the *app* folder, create a new `docker-compose.yml` file.
In it, write the following:

	version: '3.3'

	services:
	  node-app:
	    build: app
	    environment:
        APP_ENVIRONMENT: 'Default'


Save this file, and create `docker-compose.override.yml` in the same directory with the following contents:

	version: '3.3'

	services:
	  node-app:
	    environment:
	      APP_ENVIRONMENT: 'Development'
	      NODE_PORT: '8080'
	    ports:
	      - '8080:8080'


Now use `docker-compose up` to start the container.
If you go to <http://localhost:8080> you should see the following message:

		Environment: Development


The Node app simply states the value of the `APP_ENVIRONMENT` variable in its returned text.
We had defined it in `docker-compose.yml` as well, but in this case Docker sees that we want to redefine it in `docker-compose.override.yml`.
Therefore, we see that our environment is `Development` instead of `Default`.

Aside from the overriding, we can also extend the original compose file.
In this case, we do that by adding an environment variable called `NODE_PORT`, which the Node app uses to determine which port to listen on.
Furthermore, we bind that port to our localhost using `ports`.

Now, we want our production environment to display something different.
Not only that, we also want to navigate to it on a different port.
To do that, create another file, next to the existing compose files, called `docker-compose.prod.yml`.
Copy the following contents in it:

	version: '3.3'

	services:
	  node-app:
	    environment:
	      APP_ENVIRONMENT: 'Production'
	      NODE_PORT: '9090'
	    ports:
	      - '9090:9090'


This last file deviates from the standard ones that Docker Compose will look for when simply using `docker-compose up`.
Therefore, we have to specify which files it has to use.
As said before, we can do this in much the same way we can specify a Dockerfile when we use `docker build`, namely with the `-f` flag.
When using this flag, Compose will not look for any of its defaults anymore, so we have to specify all the files we need.
Enter the following command:

	docker-compose -f docker-compose.yml -f docker-compose.prod.yml up


When the container is started, navigate to <http://localhost:9090> (remember we defined the app to listen on a different port this time).
Now, you should see:

	Environment: Production


You can actually chain multiple Compose files like this, each subsequent one overriding or adding to the previous.
To try this out, run the following and see if you can predict what the output will be:

	docker-compose -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.prod.yml up

# Security

Docker is already quite secure by itself. Nevertheless, if you want to
use it in real production scenarios, it is definitely a topic that
requires much attention. Containers still run, after all, on your host
system, and although they are isolated by nature they could still expose
your host to attackers if used carelessly.

Computer security is an art in and of itself, and describing every detail on
how to securely implement your infrastructure is definitely beyond the
scope of this workshop. There are, however, some best practices that
allow you to get a decent head start in securing your Docker
environment.

## Docker Bench for Security

What is even better than having a tool that can check for the most
common best practices for your environment? Exactly, one that runs
inside a Docker container! This is precisely what the Docker Bench for
Security does. It automatically tests your target Docker environment for
dozens of what are to be considered best practices for using Docker and
deploying containers in production environments. The beauty is that you
actually run this tool inside a container itself, therefore allowing it
to be very portable. Even better, it can be integrated in a Continuous
Integration process, therefore constantly reporting if there are any
major vulnerabilities.

### Using the Bench

There are a couple of ways to use the Bench. The easiest way is by using
the image that is available on the Docker Hub, which is the way we will
demonstrate it here. The code is also available on GitHub
(<https://github.com/docker/docker-bench-security>), also giving you the
option of cloning the repository and building the image yourself.

The GitHub page already provides is with a ready-for-action `docker run`
command that we can use.
Unfortunately, this tool depends a lot on having Linux as an underlying host system, as it needs to map certain volumes that are OS-specific.
On OSX, due to it being Unix-like as well, you can get a taste of it by omitting the binding to `systemd`, although this means that any test that is being run on that directory will not yield useful results.
Windows, however, differs in such fundamental ways that it is not possible to use this tool at all.
Anyway, to try it out in either case, run the following:

	FOR LINUX
    docker run -it --net host --pid host --cap-add audit_control \
        -e DOCKER_CONTENT_TRUST=$DOCKER_CONTENT_TRUST \
        -v /var/lib:/var/lib \
        -v /var/run/docker.sock:/var/run/docker.sock \
        -v /usr/lib/systemd:/usr/lib/systemd \
        -v /etc:/etc --label docker_bench_security \
        docker/docker-bench-security

	FOR OSX
	docker run -it --net host --pid host --cap-add audit_control \
        -e DOCKER_CONTENT_TRUST=$DOCKER_CONTENT_TRUST \
        -v /var/lib:/var/lib \
        -v /var/run/docker.sock:/var/run/docker.sock \
        -v /etc:/etc --label docker_bench_security \
        docker/docker-bench-security

This will start up the container that runs the tests. It will require
some access to the host system, hence the binding of volumes. Please
note that you should not ordinarily allow containers to access
directories such as `/etc` or `/usr/lib/systemd`, or in fact any
directory that contains anything vital to the host system. In this case,
however, it is necessary as the tests are performed against the
configuration of the host as well.

Once started, the instantiated container will perform a set of tests and
report these in its output. These tests are performed on a couple of
areas, such as the host, the Docker Daemon and the available images and
containers. Don’t be immediately alarmed by any red-coloured warnings.
Many of these tests are targeted at professional environments and, while
it is very interesting to see what exactly they are, can be a bit
overkill on your own machine. An audit log, for instance, which logs who
starts, stops and removes containers might be a bit over the top if you
are just using your own laptop to try out a few things.

Nevertheless, it is good to be aware of how Docker works, how it exposes
a machine to the outside world and what you can do to prevent any
security breaches. The Docker Bench for Security, in that aspect,
provides a useful tool to immediately get an overview of some very
important parts.


# Further reading

In this workshop we covered some more advanced features of Docker.
There is, however, still a lot more available.
To find out more about the Docker engine as well as tools such as Docker Compose, you can look at the available documentation on <https://docs.docker.com/>.
